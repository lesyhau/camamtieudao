/**
 * One note of a phrase, with the word sung on it.
 *
 * A cell, not two parallel strings. The earlier shape kept the notes and the words as separate
 * runs of text, which read fine only when they happened to be the same length - and they are
 * not, because a word held across a pitch change owns several notes. Pairing them here means
 * the renderer can put every word under the note it starts on, and a held word is visibly a
 * held word rather than a counting error.
 */
export interface PolishedCell {
  /** Jianpu token, mapping-independent: `5`, `6'`, `2,`, `0` for a rest. */
  token: string;
  /** The word starting on this note. Empty when the previous word is still being held. */
  syllable: string;
}

export interface PolishedLine {
  cells: PolishedCell[];
}

export interface PolishedSection {
  /** `Lời 1`, `Điệp khúc`, `Dạo đầu` - the phrase group's name. */
  title: string;
  lines: PolishedLine[];
}

export interface Polished {
  sections: PolishedSection[];
  /**
   * Which model phrased it, or `local` when the sheet's own line structure was used because
   * no model was available. Shown nowhere; kept for diagnosing a bad result.
   */
  model: string;
}
