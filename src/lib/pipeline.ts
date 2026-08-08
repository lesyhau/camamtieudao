// Image bytes -> a reply. The one place the free and paid tiers meet.
import { decodeToBinary } from "./omr/decode.ts";
import { recognizeJianpu } from "./omr/jianpu.ts";
import { paddleOcrBackend } from "./omr/paddleocr.ts";
import { fromRecognized, type RecognizedScore } from "./local/recognized.ts";
import { parseJpx } from "./camam/jpx.ts";
import { build } from "./camam/build.ts";
import { renderCamAm, summarize, recommendedMapping } from "./camam/render.ts";
import type { CamAmDoc } from "./camam/types.ts";
import { extract } from "./extract/extract.ts";
import { configFromEnv } from "./extract/gemini.ts";
import { polish } from "./polish/polish.ts";
import { renderPolished } from "./polish/render.ts";
import type { Polished } from "./polish/types.ts";

export type Tier = "free" | "paid";

/**
 * The stages a caller can watch. A conversion is 20 seconds of silence otherwise, and "it is
 * working" is a different message from "it is stuck".
 */
export type Step = "decode" | "recognize" | "build" | "polish";
export type OnStep = (step: Step) => void;

export interface ConvertResult {
  doc: CamAmDoc;
  /** Null whenever the polish model is unavailable or unhappy; the grid is the fallback. */
  polished: Polished | null;
  tier: Tier;
  ms: number;
}

/**
 * Free tier: the local OMR pipeline. No network, no per-image cost, ~13s.
 * Measured on the reference sheet at 100% pitch, 100% octave, 100% cam am, 98% rhythm.
 */
export async function convertFree(bytes: Uint8Array, mime?: string, onStep: OnStep = () => {}): Promise<ConvertResult> {
  const t0 = Date.now();
  onStep("decode");
  const bin = await decodeToBinary(bytes, mime);
  onStep("recognize");
  const rec = await recognizeJianpu(bin, paddleOcrBackend());
  onStep("build");
  const doc = build(fromRecognized(rec as unknown as RecognizedScore), "musicpp");
  onStep("polish");
  return { doc, polished: await polish(doc), tier: "free", ms: Date.now() - t0 };
}

/**
 * Paid tier: a vision model. NOT more accurate on a clean sheet - measured well below the local
 * pipeline on notes, octave and rhythm. What it buys is robustness to photographs and the
 * repeat/volta structure the local pipeline cannot see at all. Priced and described on that
 * basis, not on accuracy.
 */
export async function convertPaid(bytes: Uint8Array, mime = "image/jpeg", onStep: OnStep = () => {}): Promise<ConvertResult> {
  const t0 = Date.now();
  onStep("recognize");
  const res = await extract(configFromEnv(), {
    image: { mimeType: mime, data: Buffer.from(bytes).toString("base64") },
  });
  onStep("build");
  const doc = build(res.score, "gemini");
  onStep("polish");
  return { doc, polished: await polish(doc), tier: "paid", ms: Date.now() - t0 };
}

export async function convert(
  bytes: Uint8Array, mime: string | undefined, tier: Tier, onStep: OnStep = () => {},
): Promise<ConvertResult> {
  return tier === "paid" ? convertPaid(bytes, mime, onStep) : convertFree(bytes, mime, onStep);
}

/** The chat reply for a finished conversion. */
export function replyFor(r: ConvertResult): string {
  const { doc } = r;
  const head = [
    doc.title ? `🎼 ${doc.title}` : "🎼 Bản nhạc",
    summarize(doc),
    `(${(r.ms / 1000).toFixed(0)}s · ${r.tier === "free" ? "miễn phí" : "nâng cao"})`,
  ].join("\n");

  // The polish runs for every conversion, so the chat reply spends it too rather than
  // paying for a rewrite only the website reads.
  // `head` above already prints the title and the key/metre summary, so the polished text's
  // own two header lines are dropped rather than repeated.
  const body = r.polished
    ? renderPolished(r.polished, doc, recommendedMapping(doc)).split("\n").slice(2).join("\n").trim()
    : renderCamAm(doc, { mapping: recommendedMapping(doc), lyrics: "inline", header: false });

  const other = Object.keys(doc.mappings).find((m) => m !== recommendedMapping(doc));
  const foot = other
    ? `\nGõ "${doc.mappings[other].label}" để xem cách bấm khác.`
    : "";

  return `${head}\n\n${body}${foot}`;
}

/** Reply when something went wrong, in the user's language and without a stack trace. */
export function replyForError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/PDF/i.test(msg)) return "Mình chưa đọc được file PDF. Bạn gửi ảnh chụp hoặc PNG/JPEG của bản nhạc nhé.";
  if (/over the .* limit/.test(msg)) return "Ảnh lớn quá. Bạn gửi ảnh nhỏ hơn 20MB giúp mình nhé.";
  if (/queue is full/.test(msg)) return "Mình đang xử lý hơi nhiều. Bạn đợi một chút rồi gửi lại nhé.";
  return "Mình chưa đọc được bản nhạc này. Bạn thử chụp rõ hơn, đủ sáng và thẳng góc giúp mình nhé.";
}

/** Re-render an existing document under the other mapping, for a follow-up turn. */
export function renderWithMapping(doc: CamAmDoc, mapping: string): string {
  return renderCamAm(doc, { mapping, lyrics: "inline", header: true });
}

export { parseJpx };
