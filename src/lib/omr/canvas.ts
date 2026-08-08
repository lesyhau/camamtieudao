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
 * THE MEMORY BUG. Cropping a sub-rect out of a large canvas with the 9-argument `drawImage`
 * leaks a full-size copy of the SOURCE, every single call, and no amount of GC gets it back.
 *
 * Measured on the VM, source 2200x3112 (27MB as RGBA), destination 64x64:
 *
 *     40 crops via drawImage(bigCanvas, sx,sy,sw,sh, ...)   +1071MB   1126ms
 *     40 crops via getImageData -> small canvas -> drawImage   +29MB     55ms
 *
 * ~27MB per call is exactly one snapshot of the source. One sheet crops ~690 digit cells plus
 * ~130 lyric strips out of the page canvas, which is ~19GB of snapshots - so the process died
 * against whatever ceiling it was given: 3.6GB on the 3.9GB VM, 7.87GB on the 7.9GB one,
 * exactly 3GB under a 3GB cgroup cap. It looked like an allocator sizing itself to the machine.
 * It was a per-call leak that simply ran until it hit the wall.
 *
 * This is why the four earlier suspects were all wrong: the ORT arena, the input-shape count,
 * the input resolution, and GC pressure. None of them was allocating any of it. It is also why
 * forcing GC made no difference - the snapshots are native and unreachable from V8.
 *
 * The patch goes on the CONTEXT PROTOTYPE rather than at the ~4 call sites so that a re-sync
 * from jpeditor's OMR (which is browser code, where this defect does not exist) cannot quietly
 * reintroduce it. The fast path is taken only when it is both safe and worth it - a sub-rect
 * fully inside a source substantially bigger than the region being read - and everything else
 * falls through to the original untouched.
 */
type DrawArgs = [unknown, ...number[]];
const ctxProto = Object.getPrototypeOf(napiCreateCanvas(1, 1).getContext("2d")) as {
  drawImage: (...a: DrawArgs) => void;
};
const nativeDrawImage = ctxProto.drawImage;

/** Escape hatch for measuring the patch's effect on recognition. `0` restores the leak. */
const CROP_ENABLED = process.env.OMR_CANVAS_CROP !== "0";

ctxProto.drawImage = function (this: unknown, ...args: DrawArgs) {
  const src = args[0] as { width?: number; height?: number; getContext?: unknown } | null;
  if (CROP_ENABLED && args.length === 9 && src && typeof src.getContext === "function") {
    const [, sx, sy, sw, sh, dx, dy, dw, dh] = args as [unknown, ...number[]];
    const W = src.width ?? 0, H = src.height ?? 0;
    // Only when the region is strictly inside the source (a partly-outside read has different
    // edge semantics, and the callers that do it have already clamped), and only when the
    // source is big enough relative to the region for a snapshot to be the dominant cost.
    if (sw >= 1 && sh >= 1 && sx >= 0 && sy >= 0 && sx + sw <= W && sy + sh <= H && W * H > sw * sh * 4) {
      const region = (src as unknown as Canvas).getContext("2d").getImageData(sx, sy, sw, sh);
      const tmp = napiCreateCanvas(sw, sh);
      tmp.getContext("2d").putImageData(region, 0, 0);
      return nativeDrawImage.call(this, tmp, 0, 0, sw, sh, dx, dy, dw, dh);
    }
  }
  return nativeDrawImage.apply(this, args);
};

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
