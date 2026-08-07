// logo.png (black ink on white) -> the site's logo and icon files.
//
//   node scripts/logo-assets.ts
//
// The artwork ships as the PHOTOGRAPH of the brush mark, not as a trace of it. A vector trace
// of an ensō is a lie about what the mark is: the dry-brush edge, the speckle where the bristles
// skipped, and the thinning tail are the artwork, and every one of them is a soft alpha
// gradient that a filled path can only approximate.
//
// Three transforms, in order:
//
//   1. Alpha from LUMINANCE (alpha = 255 - luma), colour forced flat. Not a threshold: a
//      threshold hard-cuts every anti-aliased edge and turns the speckle into jagged pixels.
//      This is also what "remove the white background" means here - white is not keyed out,
//      it simply lands at alpha 0, so a grey pixel stays a half-transparent grey pixel.
//   2. Trim to the ink's bounding box (the source has ~10% dead margin) squared off around its
//      centre, so the mark fills the box it is given instead of floating in it.
//   3. Downscale by repeated halving. One 1024->256 jump loses the thin tail; halving keeps
//      every step in filter range.
//
// Ink colour is baked per file rather than left to a CSS filter, because the mark has to be
// ink-primary in each mode and those are two different hues (deep teal / pale blue), not an
// inversion of one another.
import { readFileSync, writeFileSync } from "node:fs";
import { createCanvas, loadImage, type Canvas } from "@napi-rs/canvas";

const root = new URL("../", import.meta.url);

/** Alpha-from-luminance, flat `ink` colour. Returns the ink bounding box alongside. */
async function inkMask(src: URL, ink: [number, number, number]) {
  const img = await loadImage(readFileSync(src));
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  const data = ctx.getImageData(0, 0, img.width, img.height);
  const px = data.data;
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1, opaque = 0;

  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      // Rec.601 luma. The source is greyscale, but reading all three channels costs nothing
      // and survives a logo that is not perfectly neutral.
      const luma = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
      const alpha = Math.round(255 - luma);
      px[i] = ink[0]; px[i + 1] = ink[1]; px[i + 2] = ink[2]; px[i + 3] = alpha;
      // The bbox ignores the faintest halo, which otherwise reaches the paper's edge and makes
      // the trim a no-op.
      if (alpha > 16) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        opaque++;
      }
    }
  }
  ctx.putImageData(data, 0, 0);
  return { canvas, box: { x0, y0, x1, y1 }, opaque, w: img.width, h: img.height };
}

/** Square crop centred on the ink, padded, clamped to the source. */
function squareCrop(m: Awaited<ReturnType<typeof inkMask>>, pad: number): Canvas {
  const cx = (m.box.x0 + m.box.x1) / 2, cy = (m.box.y0 + m.box.y1) / 2;
  const side = Math.round(Math.max(m.box.x1 - m.box.x0, m.box.y1 - m.box.y0) * (1 + pad));
  const out = createCanvas(side, side);
  out.getContext("2d").drawImage(m.canvas, Math.round(cx - side / 2), Math.round(cy - side / 2), side, side, 0, 0, side, side);
  return out;
}

/** Downscale by halving until one more halving would overshoot, then the final step. */
function resize(src: Canvas, size: number): Canvas {
  let cur = src;
  while (cur.width / 2 > size) {
    const half = createCanvas(Math.round(cur.width / 2), Math.round(cur.height / 2));
    half.getContext("2d").drawImage(cur, 0, 0, half.width, half.height);
    cur = half;
  }
  if (cur.width === size) return cur;
  const out = createCanvas(size, size);
  out.getContext("2d").drawImage(cur, 0, 0, size, size);
  return out;
}

// ink-primary in each mode, straight from globals.css - so the mark is the same ink as the
// wordmark beside it rather than a near-miss.
const INK_DARK: [number, number, number] = [204, 232, 242];  // dark mode
const INK_LIGHT: [number, number, number] = [22, 78, 99];    // light mode
// The favicon has no mode to read: browser tab strips are dark on some platforms and light on
// others. brand-solid is the one step with usable contrast against both.
const INK_ICON: [number, number, number] = [32, 111, 141];

const src = new URL("logo.png", root);

// Header renders at 28px, footer at 32px; 256 covers 3x displays with room to spare.
const OUT: Array<[string, [number, number, number], number, number]> = [
  ["public/logo.png", [17, 24, 26], 512, 0.06],        // neutral master: OG images, share cards
  ["public/logo-dark.png", INK_DARK, 256, 0.06],
  ["public/logo-light.png", INK_LIGHT, 256, 0.06],
  ["src/app/icon.png", INK_ICON, 256, 0.06],
  ["src/app/apple-icon.png", INK_ICON, 180, 0.14],     // iOS crops to a rounded square: more air
];

for (const [path, ink, size, pad] of OUT) {
  const mask = await inkMask(src, ink);
  const png = resize(squareCrop(mask, pad), size).toBuffer("image/png");
  writeFileSync(new URL(path, root), png);
  const pct = ((mask.opaque / (mask.w * mask.h)) * 100).toFixed(1);
  console.log(`${path.padEnd(24)} ${size}x${size}  ${(png.length / 1024).toFixed(0)}KB  (ink ${pct}% of source)`);
}
