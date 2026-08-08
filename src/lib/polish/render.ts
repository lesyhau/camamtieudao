// The polished score as plain text - what the copy button puts on the clipboard and what the
// chat adapters send back.
//
// Shared so the three surfaces cannot drift: what you read on the page, what you paste into a
// forum post, and what Messenger replies with are the same lines.
import { nameOf, pos } from "../camam/camam.ts";
import type { CamAmDoc } from "../camam/types.ts";
import type { Polished } from "./types.ts";

/**
 * One jianpu token -> the cảm âm name, through the same renderer and the same band offset the
 * original conversion used. A token that is not a note comes back unchanged: the model should
 * not have produced it, and showing it is more honest than guessing a pitch.
 */
export function renderToken(token: string, doc: CamAmDoc, mapping: string): string {
  if (token === "0") return "–";
  const m = /^([1-7])('+|,+)?$/.exec(token);
  const info = doc.mappings[mapping];
  if (!m || !info) return token;
  const octave = !m[2] ? 0 : m[2][0] === "'" ? m[2].length : -m[2].length;
  return nameOf(pos(Number(m[1]), octave), null, info.anchorDigit, info.bandOffset);
}

export function renderPolished(polished: Polished, doc: CamAmDoc, mapping: string): string {
  const head = [
    doc.title || "Bản nhạc",
    [doc.key.jianpu, `${doc.meter.beats}/${doc.meter.beatType}`, doc.tempo ? `♩=${doc.tempo.bpm}` : null]
      .filter(Boolean).join(" · "),
  ];

  const body: string[] = [];
  for (const sec of polished.sections) {
    body.push("");
    if (sec.title) body.push(`## ${sec.title}`);
    for (const line of sec.lines) {
      // Plain text cannot hold a column, so the two rows go back to two lines here - but they
      // are generated from the same cells, so the words are in the same order as the notes
      // they belong to.
      body.push(line.cells.map((c) => renderToken(c.token, doc, mapping)).join(" "));
      const lyric = line.cells.map((c) => c.syllable).filter(Boolean).join(" ");
      if (lyric) body.push(lyric);
      body.push("");
    }
  }

  return [...head, ...body].join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
