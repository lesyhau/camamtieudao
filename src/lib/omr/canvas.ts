// The browser drawing surface the OMR path needs, on Node.
//
// The vendored pipeline reaches for exactly five things - construct a canvas, get a 2d
// context, drawImage, getImageData, putImageData - across about 24 call sites. @napi-rs/canvas
// implements all of them with the same signatures, so this is a naming shim rather than a
// reimplementation: `new OffscreenCanvas(w, h)` becomes `createCanvas(w, h)` and nothing else
// changes.
//
// Kept as its own module so the vendored files differ from jpeditor's originals by an import
// line rather than by edited logic - that is what makes them re-syncable when jpeditor's OMR
// moves on.
import { Canvas, ImageData as NapiImageData, createCanvas as napiCreateCanvas, loadImage } from "@napi-rs/canvas";

export type OffscreenCanvasLike = Canvas;

/**
 * Drop-in for `new OffscreenCanvas(w, h)`.
 *
 * Exported as BOTH a value and a type under that name, deliberately. The vendored files
 * annotate parameters as `OffscreenCanvas`, and an imported value shadows only the global
 * value - the type annotation would still resolve to the DOM lib's OffscreenCanvas, which a
 * napi Canvas is not assignable to. Exporting the type as well shadows both, so the vendored
 * signatures compile untouched.
 *
 * Declared constructor-shaped because the vendored code writes `new OffscreenCanvas(...)`;
 * returning a foreign instance from a constructor is legal and does exactly this.
 */
export type OffscreenCanvas = Canvas;
export const OffscreenCanvas = function (this: unknown, w: number, h: number): Canvas {
  return napiCreateCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
} as unknown as { new (w: number, h: number): Canvas };

/**
 * Node has no `ImageData` global. Re-exported as both value and type for the same reason as
 * OffscreenCanvas above: the vendored files both construct it and annotate with it.
 */
export type ImageData = NapiImageData;
export const ImageData = NapiImageData;

/**
 * Decodes image bytes to a canvas. Replaces `createImageBitmap(new Blob([bytes]))`, which
 * needs a browser. Handles everything @napi-rs/canvas decodes natively - PNG, JPEG, WebP, AVIF.
 */
export async function decodeImage(bytes: Uint8Array): Promise<Canvas> {
  const img = await loadImage(Buffer.from(bytes));
  const canvas = napiCreateCanvas(img.width, img.height);
  canvas.getContext("2d").drawImage(img, 0, 0);
  return canvas;
}
