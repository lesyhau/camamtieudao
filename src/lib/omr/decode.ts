// Image bytes -> binary ink map, on Node.
//
// Replaces jpeditor's browser decode, which used createImageBitmap + OffscreenCanvas. The
// binarization itself (preprocess.ts) is pure arithmetic and is vendored unchanged, so the
// only thing that differs is how pixels are obtained.
import { rgbaToBinary } from "./preprocess.ts";
import { decodeImage } from "./canvas.ts";
import type { Binary } from "./types.ts";

/** Larger images are downscaled first: past this, connected components get no more stable and
 *  everything downstream gets slower. Matches jpeditor's own limit so the tuned thresholds in
 *  jianpu.ts keep meaning what they meant. */
const MAX_W = 2200;

/** True for PDF bytes, by mime or by the %PDF- magic number. */
function isPdf(bytes: Uint8Array, mime?: string): boolean {
  if (mime === "application/pdf") return true;
  return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

/** Image bytes -> binary ink map (1 = ink). */
export async function decodeToBinary(bytes: Uint8Array, mime?: string): Promise<Binary> {
  if (isPdf(bytes, mime)) {
    // jpeditor rasterizes PDFs with pdf.js, preferring the largest embedded bitmap over a
    // full-page render. That path needs porting in its own right and no Zalo user sends a PDF
    // from a phone, so it fails clearly rather than half-working.
    throw new Error("PDF input is not supported yet - send a photo or a PNG/JPEG of the sheet.");
  }

  const src = await decodeImage(bytes);
  const scale = src.width > MAX_W ? MAX_W / src.width : 1;
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));

  let img;
  if (scale === 1) {
    img = src.getContext("2d").getImageData(0, 0, w, h);
  } else {
    const { OffscreenCanvas } = await import("./canvas.ts");
    const scaled = new OffscreenCanvas(w, h);
    const ctx = scaled.getContext("2d");
    ctx.drawImage(src, 0, 0, w, h);
    img = ctx.getImageData(0, 0, w, h);
  }

  return rgbaToBinary(img.data as unknown as Uint8ClampedArray, img.width, img.height);
}
