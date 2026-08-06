// The jianpu note token, shared by every format that carries one.
//
// `.jpwabc` and JPX use the SAME note grammar on purpose - JPX is that grammar plus inline
// lyrics and minus JP-Word's layout markers. One reader means a note that parses from ground
// truth parses identically from model output, so the two can never drift into disagreeing
// about what `7,._` means.
import type { Accidental } from "./types.ts";

/** accidental? digit octave-marks? dots-and-underscores dashes */
export const NOTE_RE = /^(#b|#|b)?([0-7])('+|,+)?([._]*)(-*)/;

export interface NoteToken {
  digit: number;
  octave: number;
  accidental: Accidental;
  underscores: number;
  dots: number;
  dashes: number;
}

/**
 * Read one note token off the front of `s`. Returns null if it does not start with one.
 *
 * Dots and underscores are consumed together and counted separately rather than required in a
 * fixed order: the JP-Word ground truth is itself inconsistent about it, mixing `6,_.` and
 * `2._` in the same file.
 */
export function readNote(s: string): { note: NoteToken; len: number } | null {
  const m = NOTE_RE.exec(s);
  if (!m) return null;
  const [full, acc, digit, oct, mods, dashes] = m;
  return {
    note: {
      digit: Number(digit),
      octave: !oct ? 0 : oct[0] === "'" ? oct.length : -oct.length,
      accidental: acc === "#b" ? "n" : acc === "#" ? "#" : acc === "b" ? "b" : null,
      underscores: (mods.match(/_/g) ?? []).length,
      dots: (mods.match(/\./g) ?? []).length,
      dashes: dashes.length,
    },
    len: full.length,
  };
}

/** Inverse of readNote. Emits the canonical order: accidental, digit, octave, dots, underscores, dashes. */
export function writeNote(n: NoteToken): string {
  const acc = n.accidental === "n" ? "#b" : n.accidental === "#" ? "#" : n.accidental === "b" ? "b" : "";
  const oct = n.octave > 0 ? "'".repeat(n.octave) : n.octave < 0 ? ",".repeat(-n.octave) : "";
  return acc + n.digit + oct + ".".repeat(n.dots) + "_".repeat(n.underscores) + "-".repeat(n.dashes);
}
