// logo.png -> traced SVG.
//
//   node scripts/logo-trace.ts [threshold] [epsilon] [minArea]
//
// Written rather than reached for, because potrace is not installed and the whole job is three
// well-understood steps:
//
//   1. threshold to a binary ink mask
//   2. marching squares to closed contours - every contour, outer edges and holes alike
//   3. Douglas-Peucker to drop redundant vertices, then quadratic Béziers through the survivors
//
// Holes need no special handling: fill-rule="evenodd" makes a contour inside another subtract
// automatically, which is what turns the ring into a ring instead of a disc.
import { readFileSync, writeFileSync } from "node:fs";
import { createCanvas, loadImage } from "@napi-rs/canvas";

type Pt = [number, number];

const THRESHOLD = Number(process.argv[2] ?? 128);
const EPSILON = Number(process.argv[3] ?? 0.8);
const MIN_AREA = Number(process.argv[4] ?? 6);

const root = new URL("../", import.meta.url);
const img = await loadImage(readFileSync(new URL("logo.png", root)));
const W = img.width, H = img.height;
const canvas = createCanvas(W, H);
const ctx = canvas.getContext("2d");
ctx.drawImage(img, 0, 0);
const px = ctx.getImageData(0, 0, W, H).data;

/** ink(x,y): 1 inside the mark. Outside the image counts as background, which is what keeps a
 *  contour touching the border closed. */
const ink = (x: number, y: number): number => {
  if (x < 0 || y < 0 || x >= W || y >= H) return 0;
  const i = (y * W + x) * 4;
  const luma = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
  return luma < THRESHOLD ? 1 : 0;
};

/**
 * Marching squares over the pixel lattice.
 *
 * Each cell has four pixel-centre corners, giving 16 cases. Cases 5 and 10 are the ambiguous
 * saddles; they are resolved consistently (always connecting the same way) so that adjacent
 * cells agree and every contour closes. Segments are keyed by their endpoints and then chained
 * into loops.
 */
function contours(): Pt[][] {
  const segs = new Map<string, Pt[]>();
  const key = (p: Pt) => `${p[0]},${p[1]}`;
  const add = (a: Pt, b: Pt) => {
    const k = key(a);
    const list = segs.get(k);
    if (list) list.push(b); else segs.set(k, [b]);
  };

  for (let y = -1; y < H; y++) {
    for (let x = -1; x < W; x++) {
      const tl = ink(x, y), tr = ink(x + 1, y), br = ink(x + 1, y + 1), bl = ink(x, y + 1);
      const c = (tl << 3) | (tr << 2) | (br << 1) | bl;
      if (c === 0 || c === 15) continue;
      // Midpoints of the cell's edges, in pixel-centre coordinates.
      const T: Pt = [x + 0.5, y], R: Pt = [x + 1, y + 0.5], B: Pt = [x + 0.5, y + 1], L: Pt = [x, y + 0.5];
      // DIRECTED so that ink stays on the left of travel. The direction is not cosmetic: the
      // loop walk below follows each segment's end to the next segment starting there, so a
      // single reversed case lets two unrelated contours chain into one - which is exactly
      // what turned the figure into a set of diagonal wedges.
      switch (c) {
        case 1:  add(B, L); break;
        case 2:  add(R, B); break;
        case 3:  add(R, L); break;
        case 4:  add(T, R); break;
        case 5:  add(T, R); add(B, L); break;   // saddle, resolved consistently in both cells
        case 6:  add(T, B); break;
        case 7:  add(T, L); break;
        case 8:  add(L, T); break;
        case 9:  add(B, T); break;
        case 10: add(L, B); add(R, T); break;   // saddle, resolved consistently in both cells
        case 11: add(R, T); break;
        case 12: add(L, R); break;
        case 13: add(B, R); break;
        case 14: add(L, B); break;
      }
    }
  }

  const loops: Pt[][] = [];
  while (segs.size) {
    const startKey = segs.keys().next().value as string;
    const start = startKey.split(",").map(Number) as Pt;
    const loop: Pt[] = [start];
    let cur = start;
    for (;;) {
      const nexts = segs.get(key(cur));
      if (!nexts || !nexts.length) break;
      const next = nexts.pop()!;
      if (!nexts.length) segs.delete(key(cur));
      loop.push(next);
      cur = next;
      if (key(cur) === startKey) break;
    }
    if (loop.length > 3) loops.push(loop);
  }
  return loops;
}

/**
 * Douglas-Peucker on a CLOSED loop.
 *
 * Plain DP anchors on the first and last vertex, which on a closed loop are the same point:
 * the chord has zero length, every perpendicular distance computes as zero, and the entire
 * contour collapses to two points. That silently destroyed every contour here - the trace
 * reported hundreds of them and then dropped them all as having no area.
 *
 * Splitting at the vertex farthest from the start gives two genuine open polylines, each with
 * a chord DP can measure against.
 */
function simplifyClosed(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 8) return pts;
  const closed = pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1];
  const ring = closed ? pts.slice(0, -1) : pts;
  if (ring.length < 8) return ring;

  let far = 0, farD = -1;
  for (let i = 1; i < ring.length; i++) {
    const d = (ring[i][0] - ring[0][0]) ** 2 + (ring[i][1] - ring[0][1]) ** 2;
    if (d > farD) { farD = d; far = i; }
  }
  const a = simplifyOpen(ring.slice(0, far + 1), eps);
  const b = simplifyOpen(ring.slice(far), eps);
  return a.concat(b.slice(1, -1));
}

/** Douglas-Peucker. Drops vertices that sit within `eps` of the chord they span. */
function simplifyOpen(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    if (b - a < 2) continue;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    let best = -1, bestD = eps;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len;
      if (d > bestD) { bestD = d; best = i; }
    }
    if (best > 0) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

const area = (p: Pt[]): number => {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    a += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]);
  }
  return Math.abs(a / 2);
};

/**
 * Quadratic Béziers through the midpoints of consecutive segments, with each vertex as the
 * control point. Cheap, and it removes the polygonal facets that a straight-line trace shows
 * on a brush edge at any size above a favicon.
 */
function toPath(pts: Pt[], dp: number): string {
  const r = (n: number) => Number(n.toFixed(dp));
  const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  if (pts.length < 4) {
    return `M${pts.map((p) => `${r(p[0])} ${r(p[1])}`).join("L")}Z`;
  }
  const start = mid(pts[pts.length - 1], pts[0]);
  let d = `M${r(start[0])} ${r(start[1])}`;
  for (let i = 0; i < pts.length; i++) {
    const c = pts[i];
    const m = mid(c, pts[(i + 1) % pts.length]);
    d += `Q${r(c[0])} ${r(c[1])} ${r(m[0])} ${r(m[1])}`;
  }
  return d + "Z";
}

const all = contours();
const kept = all.map((c) => simplifyClosed(c, EPSILON)).filter((c) => area(c) >= MIN_AREA);
const dropped = all.length - kept.length;

const d = kept.map((c) => toPath(c, 1)).join("");
const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" fill="currentColor" fill-rule="evenodd">` +
  `<path d="${d}"/></svg>\n`;

writeFileSync(new URL("public/logo.svg", root), svg);

// The component is GENERATED from the same trace rather than hand-copied, so the mark in the
// header can never drift from the file in public/. Inlined rather than loaded as an <img>
// because the path has to take currentColor: the mark is ink, and ink has to invert between
// the light and dark canvases.
const component = `// GENERATED by scripts/logo-trace.ts from logo.png - do not edit by hand.
//
// Traced with marching squares at threshold ${THRESHOLD}, Douglas-Peucker eps ${EPSILON},
// contours under ${MIN_AREA}px² dropped. Re-run the script to regenerate at a different
// fidelity; ${(svg.length / 1024).toFixed(0)}KB here is indistinguishable from the source at header size.
//
// fill-rule="evenodd" is what makes the ring a ring: a contour inside another subtracts,
// so holes need no separate handling.
import { forwardRef } from 'react'

interface BrandIconProps {
  size?: number
  className?: string
}

export const BrandIcon = forwardRef<SVGSVGElement, BrandIconProps>(
  function BrandIcon({ size = 64, className }, ref) {
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 ${W} ${H}"
        width={size}
        height={size}
        className={className}
        fill="currentColor"
        fillRule="evenodd"
        aria-hidden="true"
      >
        <path d="${d}" />
      </svg>
    )
  }
)
`;
writeFileSync(new URL("src/components/ui/BrandIcon.tsx", root), component);

// The favicon is the same artwork on its own, so a browser tab and the header cannot disagree.
writeFileSync(
  new URL("src/app/icon.svg", root),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" fill="#164E63" fill-rule="evenodd"><path d="${d}"/></svg>
`,
);

const verts = kept.reduce((n, c) => n + c.length, 0);
console.log(`contours ${all.length} -> kept ${kept.length} (dropped ${dropped} under ${MIN_AREA}px²)`);
console.log(`vertices ${verts}   svg ${(svg.length / 1024).toFixed(0)}KB   threshold ${THRESHOLD} eps ${EPSILON}`);
