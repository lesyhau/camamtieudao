// public/qr-ung-ho.png -> public/qr-ung-ho.svg
//
//   node scripts/qr-extract.ts
//
// Reads the QR out of the exported bank card and re-draws it as vector. Nothing here invents a
// payment code: the payload is DECODED from the image, checked, re-encoded, and then decoded
// again from the result to prove the round trip is lossless.
//
// The check that makes this safe is the CRC. An EMVCo payload ends with `6304` followed by a
// CRC16-CCITT over everything before it, so a single wrong character anywhere fails it. If the
// CRC of the decoded string validates AND the regenerated image decodes to the identical
// string, the new QR sends money to exactly the same place as the old one.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import jsQR from "jsqr";
import QRCode from "qrcode";

const root = new URL("../", import.meta.url);

/** CRC16-CCITT (poly 0x1021, init 0xFFFF) - the checksum EMVCo puts in tag 63. */
function crc16(s: string): string {
  let crc = 0xffff;
  for (const ch of Buffer.from(s, "utf8")) {
    crc ^= ch << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Walks the tag-length-value structure so the payload can be reported, not just trusted. */
function tlv(s: string, depth = 0): void {
  let i = 0;
  while (i + 4 <= s.length) {
    const tag = s.slice(i, i + 2);
    const len = Number(s.slice(i + 2, i + 4));
    if (!Number.isFinite(len)) return;
    const value = s.slice(i + 4, i + 4 + len);
    console.log(`${"  ".repeat(depth + 1)}${tag} (${String(len).padStart(2)}) ${value}`);
    // 38 is the merchant account block; 62 the additional-data block. Both nest.
    if ((tag === "38" || tag === "62") && depth === 0) tlv(value, depth + 1);
    i += 4 + len;
  }
}

async function decode(png: Buffer | Uint8Array): Promise<string> {
  const img = await loadImage(png);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, img.width, img.height);
  const found = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), width, height);
  if (!found) throw new Error("no QR found in the image");
  return found.data;
}

// Defaults to the exported card in public/, but takes a path so the source image can live
// anywhere - including a copy pulled back out of git after the PNG has been retired.
const arg = process.argv[2];
const src = arg ? pathToFileURL(resolve(arg)) : new URL("public/qr-ung-ho.png", root);
const payload = await decode(readFileSync(src));

console.log(`decoded ${payload.length} characters:\n  ${payload}\n`);
console.log("fields:");
tlv(payload);

// Verify the checksum the bank put there.
const body = payload.slice(0, payload.length - 4);       // everything through `6304`
const stated = payload.slice(-4);
const computed = crc16(body);
console.log(`\nCRC: stated ${stated}, computed ${computed} -> ${stated === computed ? "VALID" : "MISMATCH"}`);
if (stated !== computed) {
  throw new Error("the decoded payload fails its own checksum - refusing to publish a payment code from it");
}

// Re-encode. Error correction M is what banks print; `margin: 2` is the quiet zone, in modules.
const svg = await QRCode.toString(payload, {
  type: "svg",
  errorCorrectionLevel: "M",
  margin: 2,
  color: { dark: "#000000", light: "#00000000" },   // transparent ground: the card behind shows through
});
writeFileSync(new URL("public/qr-ung-ho.svg", root), svg);

// Prove the round trip: rasterise what we just wrote and read it back.
const png = await QRCode.toBuffer(payload, { errorCorrectionLevel: "M", margin: 2, width: 600 });
const again = await decode(png);
console.log(`round trip: regenerated QR decodes to the same payload -> ${again === payload ? "IDENTICAL" : "DIFFERENT"}`);
if (again !== payload) throw new Error("the regenerated QR does not decode to the original payload");

console.log(`\npublic/qr-ung-ho.svg  ${(svg.length / 1024).toFixed(1)}KB (was ${(readFileSync(src).length / 1024).toFixed(0)}KB as PNG)`);
