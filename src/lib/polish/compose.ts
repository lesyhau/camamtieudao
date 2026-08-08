// The parts of "make it human-friendly" that are decidable from data, done in code.
//
// The first attempt asked one model call to do all four jobs at once - segment by sentence,
// drop repeated notes, merge the verses, name the sections - and was shown the notes to do it
// with. Measured on the reference song, gemini-3.5-flash-lite kept 394 of 419 notes (so it
// collapsed almost nothing), produced one phrase per printed line rather than per sentence, and
// copied the `a/b` verse notation straight into the words: `个/们 世/命 界/运`. gemini-3.5-flash
// did not answer at all: 2368 input tokens of notes and instructions, and it spent its whole
// budget thinking (finish=MAX_TOKENS). Both recovered completely once the job got smaller.
//
// Two of those four jobs are not judgement calls at all:
//
//   - Collapsing a repeat inside one syllable is exact. The document already models which
//     notes belong to which syllable; a repeat is a note whose pitch equals the one before it
//     inside that group.
//   - Merging the verses is a choice between two strings, and verse 1 is the answer unless it
//     is empty.
//
// So the model is asked for the one thing code cannot do - where the sentences end, and what
// to call each section - and it answers in WORDS, which it is good at. The notes never pass
// through it, so a model mistake can cost a line break or a section title, never a pitch.
import type { CamAmDoc, Note } from "../camam/types.ts";

/** One sung syllable (or one unsung run) with the notes it carries. */
export interface Unit {
  /** The merged lyric for this syllable; empty for an instrumental run. */
  syllable: string;
  notes: Note[];
}

/** Punctuation is glued to the syllable for display but ignored when matching. */
export const bare = (s: string): string => s.replace(/[\s\p{P}]+/gu, "");

/**
 * Chinese sheets usually carry a credit line along the bottom - a website, a QQ group, a
 * transcriber's name - and it sits close enough to the last stave that the reader can take it
 * for a lyric row. It then arrives here as "words" like `ht t p：` and `wwwqupu comspace`.
 *
 * Only patterns that are unambiguous are dropped: a URL fragment, or a long run of digits. A
 * bare latin word is NOT dropped, because a lyric can legitimately contain one.
 */
const HAN = /\p{Script=Han}/u;
/**
 * Not a word of the song.
 *
 * A Chinese sheet's lyric row is Han characters. The credit line printed along the bottom -
 * a website, a QQ group, "JP-Word" - sits close enough to the last stave to be read as another
 * lyric row, and arrives here as `ht`, `t`, `p：`, `wwwqupu`, `JP-`. Anything with no Han
 * character in it at all is that, not lyric.
 *
 * The trade: a Chinese song that prints an English word in its lyrics loses that word. That is
 * rare, and the alternative - a stave of watermark under the last line of every sheet - is not.
 */
const isJunk = (syllable: string): boolean => syllable.trim() !== "" && !HAN.test(syllable);

/**
 * The song as a list of syllables, verses merged and repeats inside a syllable collapsed.
 *
 * Rests survive: a rest is a thing you do, not a repeat of the note before it.
 */
export function units(doc: CamAmDoc): Unit[] {
  const lyricOf = (group: number): string => {
    const g = doc.groups.find((x) => x.id === group);
    if (!g) return "";
    // Verse 1 unless it has nothing to say here, then whichever verse does. A song whose
    // second verse is the interesting one at this bar is rarer than one whose first verse is
    // simply not printed under an instrumental pickup.
    for (let v = 1; v <= doc.verseCount; v++) {
      const s = (g.lyrics[String(v)] ?? "").trim();
      if (s) return s;
    }
    return "";
  };

  const out: Unit[] = [];
  let current: Unit | null = null;
  let currentGroup = -1;

  for (const n of doc.notes) {
    const starts = n.group !== currentGroup;
    if (starts) {
      currentGroup = n.group;
      const raw = lyricOf(n.group);
      const syllable = isJunk(raw) ? "" : raw;
      // Consecutive unsung notes stay in one run rather than becoming one unit each.
      if (!syllable && current && !current.syllable) {
        // fall through and append to the run in progress
      } else {
        current = { syllable, notes: [] };
        out.push(current);
      }
    }
    if (!current) { current = { syllable: "", notes: [] }; out.push(current); }

    const prev = current.notes[current.notes.length - 1];
    const samePitch = prev && !prev.rest && !n.rest && prev.digit === n.digit && prev.octave === n.octave;
    // A repeat only collapses INSIDE a syllable. The same pitch under the next word is a
    // note you play again.
    if (samePitch && current.syllable) continue;
    current.notes.push(n);
  }

  return unglue(out.filter((u) => u.notes.length));
}

/**
 * One lyric cell can arrive holding a whole clause - `我会在你的心` where the sheet prints six
 * separate characters under six separate notes. The lyric reader failed to find the gaps, so
 * downstream everything is one syllable held across six notes, and the words stop lining up
 * with the notes for the rest of the phrase.
 *
 * Split it back: one Han character per note, in order. Trailing punctuation stays with the last
 * character. If there are more characters than notes the surplus joins the final note rather
 * than being dropped - a crowded cell is better than a missing word.
 */
export function unglue(us: Unit[]): Unit[] {
  const out: Unit[] = [];
  for (const u of us) {
    const chars = u.syllable.match(/\p{Script=Han}[^\p{Script=Han}\s]*/gu) ?? [];
    if (chars.length < 2 || u.notes.length < 2) { out.push(u); continue; }

    const n = Math.min(chars.length, u.notes.length);
    for (let k = 0; k < n; k++) {
      const last = k === n - 1;
      out.push({
        syllable: last ? chars.slice(k).join("") : chars[k],
        // The last unit keeps whatever notes are left, so a held tail stays held.
        notes: last ? u.notes.slice(k) : [u.notes[k]],
      });
    }
  }
  return out;
}

/** The sung syllables, in order - the only thing the model is shown. */
export const sungText = (us: Unit[]): string =>
  us.filter((u) => u.syllable).map((u) => u.syllable).join(" ");

export interface Phrase {
  /**
   * The units of this phrase, in order. Keeping units rather than a flat note list plus a
   * separate lyric string is what makes the pairing renderable: a word belongs to the note it
   * starts on, and the notes after it in the same unit are that word held.
   */
  units: Unit[];
}

/** Every note of a phrase, in order. Used for accounting, not for display. */
export const phraseNotes = (p: Phrase): Note[] => p.units.flatMap((u) => u.notes);

/**
 * What the phrase actually shows: one note, one word.
 *
 * Two things are dropped, and both are cảm âm convention rather than shortcuts.
 *
 * RESTS. A cảm âm is a stream of fingerings; a rest is where you stop blowing, and it is read
 * off the phrasing, not off a dash in the middle of the line. Printing them put a `–` at the
 * head of most phrases and taught the reader to skip a character that meant nothing to them.
 *
 * HELD NOTES in a sung phrase. When a word is carried across a pitch change the sheet writes
 * several notes for one syllable; a cảm âm writes the one you start on. Keeping them was what
 * made a line of 22 notes sit above 6 words.
 *
 * An instrumental phrase has no words to pair with, so all of its pitched notes survive - that
 * is the whole content of an intro or a break.
 */
export function phraseCells(p: Phrase): { token: string; syllable: string; note: Note }[] {
  const sung = p.units.some((u) => u.syllable);
  const out: { token: string; syllable: string; note: Note }[] = [];
  for (const u of p.units) {
    if (sung && !u.syllable) continue;               // a run with no word of its own
    for (const [k, n] of u.notes.entries()) {
      if (n.rest) continue;
      if (sung && k > 0) continue;                   // the word starts on the first note
      out.push({ token: "", syllable: k === 0 ? u.syllable : "", note: n });
    }
  }
  return out;
}
/** The words of a phrase as one line of text. */
export const phraseLyric = (p: Phrase): string =>
  p.units.map((u) => u.syllable).filter(Boolean).join(" ");
export interface Composed {
  title: string;
  phrases: Phrase[];
}

/**
 * Walks the model's phrasing back onto the units.
 *
 * The model returns the same syllables it was given, split into lines. Matching them back
 * one by one - rather than trusting a count - is what keeps the words and the notes in step
 * when it drops or repeats a syllable. A token that matches nothing within a short lookahead
 * is discarded instead of advancing the units, so one hallucinated word costs one word.
 *
 * Unsung runs attach to the phrase they follow, except any at the very start, which become a
 * phrase of their own - that is the intro.
 */
export function compose(us: Unit[], sections: { title: string; lines: string[] }[]): Composed[] {
  const out: Composed[] = [];
  let i = 0;                      // cursor into `us`

  /** Absorb any unsung units at the cursor. */
  const drainUnsung = (into: Unit[]): void => {
    while (i < us.length && !us[i].syllable) into.push(us[i++]);
  };

  const lead: Unit[] = [];
  drainUnsung(lead);
  if (lead.length) out.push({ title: "Dạo đầu", phrases: [{ units: lead }] });

  for (const sec of sections) {
    const phrases: Phrase[] = [];
    for (const line of sec.lines) {
      const tokens = line.split(/\s+/).filter(Boolean);
      const units: Unit[] = [];
      for (const tok of tokens) {
        const want = bare(tok);
        if (!want) continue;
        // Rests and instrumental runs BEFORE a word belong with it. Draining them here rather
        // than after each word is what stops a phrase ending on a dash: whatever follows the
        // last word waits for the next phrase to claim it.
        drainUnsung(units);
        // Look a little way ahead: a syllable the model split or joined differently should not
        // desynchronise everything after it.
        let hit = -1;
        for (let k = i; k < Math.min(i + 4, us.length); k++) {
          if (us[k].syllable && bare(us[k].syllable) === want) { hit = k; break; }
        }
        if (hit === -1) continue;               // not in the song here - drop the word
        while (i <= hit) units.push(us[i++]);
      }
      if (units.length) phrases.push({ units });
    }
    if (phrases.length) out.push({ title: sec.title, phrases });
  }

  // Anything the model never mentioned still belongs to the song.
  const rest: Unit[] = [];
  while (i < us.length) rest.push(us[i++]);
  if (rest.length) {
    const last = out[out.length - 1];
    if (last) last.phrases.push({ units: rest });
    else out.push({ title: "", phrases: [{ units: rest }] });
  }

  return out;
}

/**
 * What to show when there is no model: phrase on the song's own printed lines.
 *
 * Not as good as sentences, but it is the structure the sheet itself used, and it keeps the
 * collapsing and the verse merge - which is most of the readability win.
 */
export function composeByLine(us: Unit[]): Composed[] {
  const byLine = new Map<number, Phrase>();
  for (const u of us) {
    const line = u.notes[0].line;
    const p = byLine.get(line) ?? { units: [] };
    p.units.push(u);
    byLine.set(line, p);
  }
  const phrases = [...byLine.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => p);
  return phrases.length ? [{ title: "", phrases }] : [];
}
