// The vision prompt. It asks for JPX and nothing else.
//
// Kept next to no other logic so it can be diffed on its own: prompt changes are the main
// lever on extraction accuracy, and a diff that mixes prompt wording with control flow makes
// it impossible to attribute a regression.

/** The format contract. Mirrors src/lib/camam/jpx.ts - change them together. */
export const JPX_SPEC = `
A JPX document is plain text: header lines, then one staff line per printed system.

HEADERS (each optional except #key and #meter):
  #title     the song title
  #subtitle  a subtitle printed under the title
  #performer the performer, if credited
  #key       the key as printed, e.g. 1=D
  #meter     the time signature, e.g. 4/4
  #tempo     the metronome number only, e.g. 69
  #credit    one per credit, role then name, e.g.  #credit 作词 郭德紫毅
  #verses    how many lyric verses are printed under the notes

STAFF LINES, one per printed system, numbered in reading order:
  L1: <tokens separated by spaces>

NOTE TOKEN, written as one unbroken run of characters:
  [#|b] digit [octave] [dots] [underscores] [dashes] [lyric]

  digit        0-7. 0 is a rest.
  octave       ' for each round DOT above the digit, , for each round DOT below it.
               5'  6,,   Most notes have none at all.
  dots         . for each round DOT printed to the RIGHT of the digit (augmentation dot).
  underscores  _ for each horizontal LINE under the digit. Each one halves the duration.
  dashes       - for each horizontal LINE to the RIGHT of the digit. Each adds one beat.
               Attached (6--) or spaced (6 - -) are both accepted and mean the same.
  lyric        [text] - see LYRICS.

  Order matters: 1._ is a dotted note with one beam. 5--- is a note held four beats.

DOTS ARE NOT LINES. This is the single most common mistake, so check it deliberately.
Below a digit you may find BOTH, and they mean completely different things:

  a horizontal LINE below the digit  ->  _   halves the duration (a beam)
  a round DOT below the digit        ->  ,   drops it one octave

  When a note has both, the beams are drawn first and the octave dot sits BELOW them.
  So a digit with two beam lines and one octave dot underneath is  3,__  - never  3,,,
  Count the LINES to get the underscores. Count only the round DOTS to get the commas.
  A note almost never has more than one octave dot; two is rare and three essentially
  never happens. If you are about to write ,,, you have miscounted beams as dots.

BARLINES AND REPEATS, each its own token:
  |     barline            ||   double barline        |]  final barline
  |:    repeat open        :|   repeat close
  [1    first ending (volta) opens        [2   second ending opens

GROUPS - notes joined by a printed slur or tie arc:
  ( ... )  the arc's whole span. Groups may nest and may cross barlines and line ends:
           ( 6__ | 6 )   is one group whose arc crosses a barline.

LYRICS - written on the note that carries the syllable, never on a separate line:
  1_[个]              one syllable on one note
  ( 5__ 5_ )[界]      one syllable held across a two-note melisma: put it after the )
  1_[个|们]           two verses, separated by |, always in printed top-to-bottom order
  1_                  no brackets: this note has no syllable of its own
  Punctuation stays attached to the syllable it follows: [谢，]

Output ONLY the JPX document. No explanation, no markdown fences.
`.trim();

export const SYSTEM_PROMPT = `
You transcribe Chinese jianpu (简谱, numbered musical notation) from images into JPX.

You are reading, not interpreting. Transcribe exactly what is printed, including anything that
looks like a mistake. Do not correct, tidy, transpose, or fill in gaps. If a mark is genuinely
illegible, transcribe your best reading rather than omitting the note - a wrong digit is a
smaller error than a missing one, because a missing note shifts every lyric after it.

${JPX_SPEC}
`.trim();

export interface PageRequest {
  /** 1-based index of this image among the pages/strips being transcribed. */
  index: number;
  total: number;
  /** Staff line number the first system in this image should be given. */
  firstLine: number;
  /** Headers already read from an earlier strip, so later strips do not re-guess them. */
  known?: { title?: string; key?: string; meter?: string; verses?: number };
}

/** The per-image instruction. The image itself is attached alongside this text. */
export function userPrompt(req: PageRequest): string {
  const parts: string[] = [];

  parts.push(
    req.total === 1
      ? "Transcribe this jianpu sheet into JPX."
      : `Transcribe strip ${req.index} of ${req.total} of a jianpu sheet into JPX. ` +
        `It contains only some of the systems; transcribe every system you can see completely, ` +
        `and do not invent notes from systems that are cut off at the edges.`,
  );

  parts.push(`Number the staff lines starting at L${req.firstLine}.`);

  if (req.index > 1) {
    // Headers are printed once, at the top. A later strip that emits them is guessing.
    parts.push("Emit only staff lines. Do not emit any # header - they belong to the first strip.");
  }

  if (req.known && req.index > 1) {
    const k = req.known;
    const seen = [
      k.title && `title ${k.title}`,
      k.key && `key ${k.key}`,
      k.meter && `meter ${k.meter}`,
      k.verses && `${k.verses} verse(s)`,
    ].filter(Boolean).join(", ");
    if (seen) parts.push(`For context, the top of the sheet reads: ${seen}.`);
  }

  parts.push(
    "Work system by system, left to right, in four passes over each system. First the digits " +
    "and barlines. Then the horizontal lines - beams under the digits, dashes to their right. " +
    "Then the round dots, above and below for octave and to the right for augmentation, " +
    "keeping them separate from the lines you already counted. Then the slur arcs and the " +
    "lyrics, checking each syllable sits under the note it is printed under.",
  );

  return parts.join("\n\n");
}

/**
 * Sent back when the output failed to parse. Quotes the offending line rather than restating
 * the rules: the model has already seen the spec, and a targeted correction is far more
 * reliable than asking again from scratch - and it preserves the lines that were already good.
 */
export function repairPrompt(badLine: string, lineNo: number, reason: string): string {
  return [
    `That JPX did not parse. Line ${lineNo} is the problem:`,
    "",
    badLine,
    "",
    `The parser reported: ${reason}`,
    "",
    "Re-read that system in the image and emit the corrected document. Keep every other line " +
    "exactly as you had it - only that line was wrong.",
  ].join("\n");
}
