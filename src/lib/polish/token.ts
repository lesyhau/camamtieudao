/** `5`, `6'`, `2,`, `0` for a rest - the note as a jianpu sheet prints it. */
export function tokenOf(note: { digit: number; octave: number; rest: boolean }): string {
  if (note.rest) return "0";
  const marks = note.octave > 0 ? "'".repeat(note.octave) : ",".repeat(-note.octave);
  return `${note.digit}${marks}`;
}
