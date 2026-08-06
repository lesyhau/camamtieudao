// Zalo webhook signature verification.
//
// UNVERIFIED AGAINST A REAL EVENT. developers.zalo.me renders its docs client-side, so they
// could not be read directly, and the two secondary sources found disagree on what is hashed:
//
//   A:  sha256(data + timestamp + oaSecret)              (Zalo community answer)
//   B:  sha256(appId + data + timestamp + oaSecret)      (third-party integration write-up)
//
// Both are accepted until one is confirmed. That is not a meaningful weakening - each still
// requires the OA secret, so an attacker gains nothing from there being two - but it IS
// temporary. Set ZALO_SIGNATURE_MODE=a|b once a real event has been observed, and this stops
// accepting the other. `explain()` prints both candidates for exactly that purpose.
import { createHash, timingSafeEqual } from "node:crypto";

export type SignatureMode = "a" | "b" | "either";

export interface VerifyInput {
  /** The raw request body, byte for byte. Re-serializing parsed JSON will not match. */
  rawBody: string;
  /** Value of the X-ZEvent-Signature header, with or without the `mac=` prefix. */
  signature: string;
  timestamp: string;
  appId: string;
  oaSecret: string;
  mode?: SignatureMode;
}

const sha256Hex = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

/** The candidate base strings, in the order they were reported. */
export function candidates(i: Omit<VerifyInput, "signature" | "mode">): Record<"a" | "b", string> {
  return {
    a: sha256Hex(i.rawBody + i.timestamp + i.oaSecret),
    b: sha256Hex(i.appId + i.rawBody + i.timestamp + i.oaSecret),
  };
}

/** Constant-time compare of two hex digests of equal length. */
function sameDigest(x: string, y: string): boolean {
  if (x.length !== y.length) return false;
  return timingSafeEqual(Buffer.from(x, "hex"), Buffer.from(y, "hex"));
}

export function verifySignature(i: VerifyInput): boolean {
  const provided = i.signature.replace(/^mac=/i, "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(provided)) return false;
  const c = candidates(i);
  const mode = i.mode ?? "either";
  if (mode === "a") return sameDigest(provided, c.a);
  if (mode === "b") return sameDigest(provided, c.b);
  return sameDigest(provided, c.a) || sameDigest(provided, c.b);
}

/** Which formula a real signature matched. Log this once and pin ZALO_SIGNATURE_MODE. */
export function explain(i: Omit<VerifyInput, "mode">): string {
  const provided = i.signature.replace(/^mac=/i, "").trim().toLowerCase();
  const c = candidates(i);
  const hit = provided === c.a ? "a" : provided === c.b ? "b" : "NEITHER";
  return `signature matches formula: ${hit} (a=${c.a.slice(0, 12)}… b=${c.b.slice(0, 12)}… got=${provided.slice(0, 12)}…)`;
}
