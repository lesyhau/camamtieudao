// Cảm âm exchange document — the JSON every renderer consumes.
// Stage 1 of the pitch model lives in `digit`/`octave`/`p`; stages 2-4 (anchor,
// band normalization, case) are baked into `camAm` but stay re-derivable from `p`.

export type Accidental = "#" | "b" | "n" | null;

/** Exact rational, already reduced. `x` is the same value as a float, for convenience. */
export interface Length {
  num: number;
  den: number;
  x: number;
}

export interface Note {
  id: number;
  line: number;
  measure: number;
  rest: boolean;

  // --- stage 1: absolute jianpu position ---
  digit: number;            // 0-7, 0 = rest
  octave: number;           // -2..+2
  p: number | null;         // 7*octave + (digit-1); null for rests
  accidental: Accidental;   // as printed on the sheet

  // --- raw duration notation ---
  underscores: number;
  dots: number;
  dashes: number;
  length: Length;

  // --- derived names, one per mapping ---
  camAm: Record<string, string | null>;

  group: number;
  tie: "start" | "stop" | null;
  slur: "start" | "stop" | null;
}

export interface Group {
  id: number;
  notes: number[];
  lyrics: Record<string, string>; // verse number -> syllable(s)
}

export interface Measure {
  index: number;
  line: number;
  notes: [number, number] | null; // inclusive id range
  barline: string;
  repeatStart: boolean;
  repeatEnd: boolean;
  ending: number | null;
}

export interface Line {
  index: number;
  measures: [number, number] | null;
  pageBreak: boolean;
}

export interface MappingInfo {
  label: string;
  anchorDigit: number;
  /** Subtracted from the raw band so the song's lowest note lands in band 0. */
  bandOffset: number;
  bandsUsed: number;
}

export interface CamAmDoc {
  schemaVersion: 1;
  source: { engine: string; model?: string; warnings: string[] };

  title: string;
  subtitle?: string;
  performer?: string;
  credits: { role: string; name: string }[];
  key: { jianpu: string; tonic: string; fifths: number };
  meter: { beats: number; beatType: number };
  tempo?: { unit: string; bpm: number };
  baseUnit: "quarter";
  verseCount: number;

  pitchRange: {
    lowest: { digit: number; octave: number; p: number } | null;
    highest: { digit: number; octave: number; p: number } | null;
  };
  mappings: Record<string, MappingInfo>;

  notes: Note[];
  groups: Group[];
  measures: Measure[];
  lines: Line[];
}
