/** One printed line of the polished score: a phrase of notes with its words underneath. */
export interface PolishedLine {
  /** Jianpu tokens, mapping-independent: `5`, `6'`, `2,`, `0` for a rest. */
  tokens: string[];
  /** The words this phrase is sung to. Empty for an instrumental phrase. */
  lyric: string;
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
