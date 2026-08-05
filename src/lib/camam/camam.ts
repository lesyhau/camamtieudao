// Stages 2-4 of the pitch model: anchor -> strict accidental -> band normalize -> case.
//
// Stage 1 (digit/octave -> p) happens in the parser; everything here is a pure
// function of `p`, so a renderer can add a third anchor without re-extracting.
import type { Accidental, MappingInfo } from "./types.ts";

const RING = ["do", "re", "mi", "fa", "sol", "la", "si"];
/** Semitones above the tonic for major-scale degrees 1..7. */
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

export const pos = (digit: number, octave: number): number => 7 * octave + (digit - 1);

const mod = (a: number, n: number): number => ((a % n) + n) % n;

export interface AnchorSpec {
  id: string;
  label: string;
  anchorDigit: number; // the jianpu degree that becomes `do`
}

export const ANCHORS: AnchorSpec[] = [
  { id: "anchor5", label: "5 → do", anchorDigit: 5 },
  { id: "anchor2", label: "2 → do", anchorDigit: 2 },
];

/** Ring position + raw band for one absolute position under one anchor. */
export function place(p: number, anchorDigit: number): { ring: number; band: number } {
  const shift = anchorDigit - 1;
  const q = p - shift;
  return { ring: mod(q, 7), band: Math.floor(q / 7) };
}

/**
 * Strict accidental: relabelling a major scale from a non-tonic degree yields a mode,
 * so some ring positions sound flat/sharp against the major scale the syllables imply.
 * Anchor 5 -> mixolydian (si is flat); anchor 2 -> dorian (mi and si are flat).
 * A printed accidental from the sheet *adds* to this rather than replacing it, so
 * `#4` under anchor 5 correctly cancels back to a natural `si`.
 */
export function alteration(ring: number, anchorDigit: number, printed: Accidental): number {
  const shift = anchorDigit - 1;
  const anchorSemi = MAJOR[shift];
  const sounding = mod(MAJOR[mod(shift + ring, 7)] - anchorSemi, 12);
  const computed = sounding - MAJOR[ring];
  const printedDelta = printed === "#" ? 1 : printed === "b" ? -1 : 0;
  return computed + printedDelta;
}

const altText = (d: number): string =>
  d === 0 ? "" : d > 0 ? "#".repeat(d) : "b".repeat(-d);

/** Band -> case. 0 lower, 1 Capitalized, 2 UPPER; beyond that UPPER plus `'` and a warning. */
export function applyCase(token: string, band: number): string {
  if (band <= 0) return token.toLowerCase();
  if (band === 1) return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
  const upper = token.toUpperCase();
  return band === 2 ? upper : upper + "'".repeat(band - 2);
}

export interface PitchInput {
  p: number | null;
  accidental: Accidental;
}

export interface MappingResult {
  info: MappingInfo;
  /** Parallel to the input array; null for rests. */
  names: (string | null)[];
  overflow: boolean;
}

/**
 * Two-pass: place every note, find the lowest band actually used, shift so it is 0,
 * then render. `minBand` depends on the whole song, so this cannot be done per note.
 */
export function mapAll(notes: PitchInput[], anchor: AnchorSpec): MappingResult {
  const placed = notes.map((n) =>
    n.p === null ? null : place(n.p, anchor.anchorDigit),
  );
  const bands = placed.filter((x) => x !== null).map((x) => x!.band);
  const minBand = bands.length ? Math.min(...bands) : 0;
  const maxBand = bands.length ? Math.max(...bands) : 0;
  const bandsUsed = bands.length ? maxBand - minBand + 1 : 0;

  const names = placed.map((x, i) => {
    if (!x) return null;
    const alt = alteration(x.ring, anchor.anchorDigit, notes[i].accidental);
    return applyCase(RING[x.ring] + altText(alt), x.band - minBand);
  });

  return {
    info: {
      label: anchor.label,
      anchorDigit: anchor.anchorDigit,
      bandOffset: -minBand,
      bandsUsed,
    },
    names,
    overflow: bandsUsed > 3,
  };
}

/** length = (1/2^u) * (1 + sum 2^-k for k=1..d) + n, as an exact reduced fraction. */
export function lengthOf(underscores: number, dots: number, dashes: number) {
  const den = 2 ** (underscores + dots);
  const num = (2 ** (dots + 1) - 1) + dashes * den;
  const g = gcd(num, den);
  return { num: num / g, den: den / g, x: num / den };
}

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}
