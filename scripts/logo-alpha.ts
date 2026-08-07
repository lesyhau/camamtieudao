// logo.png (black ink on white) -> transparent PNG.
//
//   node scripts/logo-alpha.ts
//
// Alpha comes from LUMINANCE, not from a threshold: alpha = 255 - luma, colour forced to the
// ink's own black. A threshold would hard-cut every anti-aliased edge and turn the dry-brush
// speckle into jagged pixels; deriving alpha keeps the soft edges exactly as painted, so the
// mark sits on a dark canvas as convincingly as on a light one.
import { readFileSync, writeFileSync } from "node:fs";
import { createCanvas, loadImage } from "@napi-rs/canvas";

const root = new URL("../", import.meta.url);
const src = new URL("logo.png", root);
const out = new URL("public/logo.png", root);

const img = await loadImage(readFileSync(src));
const canvas = createCanvas(img.width, img.height);
const ctx = canvas.getContext("2d");
ctx.drawImage(img, 0, 0);

const data = ctx.getImageData(0, 0, img.width, img.height);
const px = data.data;

let opaque = 0;
for (let i = 0; i < px.length; i += 4) {
  // Rec.601 luma. The source is greyscale, but reading all three channels costs nothing and
  // survives a logo that is not perfectly neutral.
  const luma = px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114;
  const alpha = Math.round(255 - luma);
  px[i] = 0; px[i + 1] = 0; px[i + 2] = 0;
  px[i + 3] = alpha;
  if (alpha > 8) opaque++;
}
ctx.putImageData(data, 0, 0);
writeFileSync(out, canvas.toBuffer("image/png"));

const pct = ((opaque / (img.width * img.height)) * 100).toFixed(1);
console.log(`${img.width}x${img.height} -> public/logo.png   ink covers ${pct}% of the square`);
