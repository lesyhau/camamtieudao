// Fetch an image the user pasted a link to.
//
// This is the one place in the app where a STRANGER CHOOSES A URL THE SERVER WILL OPEN, which
// makes it the one place that can be turned into a request forgery. The machine runs on Google
// Cloud, where http://169.254.169.254/ hands out service-account tokens to anything on the box
// that asks, and `http://localhost:3000/` is this very app. A naive fetch here would let anyone
// read either and have the result returned to them in an <img>.
//
// So every hop is checked, not just the first: scheme, then the resolved ADDRESSES, then again
// after each redirect. Redirects are followed by hand precisely because `redirect: "follow"`
// would do the second hop without asking us.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class FetchImageError extends Error {
  /** Message already written for a user, in Vietnamese. */
  readonly userMessage: string;
  constructor(userMessage: string, detail?: string) {
    super(detail ?? userMessage);
    this.name = "FetchImageError";
    this.userMessage = userMessage;
  }
}

export const MAX_BYTES = 20 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const TIMEOUT_MS = 20_000;

const ipv4 = (a: string): number[] | null => {
  const p = a.split(".");
  if (p.length !== 4) return null;
  const n = p.map(Number);
  return n.every((x) => Number.isInteger(x) && x >= 0 && x <= 255) ? n : null;
};

/**
 * Everything that is not the public internet.
 *
 * Written as explicit ranges rather than "not in a public allowlist" because the interesting
 * addresses here are the ones people forget: 169.254.169.254 (cloud metadata), 100.64/10
 * (carrier NAT, and Tailscale), ::ffff:127.0.0.1 (loopback wearing an IPv6 costume).
 */
export function isPrivateAddress(addr: string): boolean {
  const a = addr.toLowerCase().replace(/^\[|\]$/g, "");

  // IPv4-mapped and IPv4-compatible IPv6 are just IPv4 with extra steps.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a);
  if (mapped) return isPrivateAddress(mapped[1]);

  const v4 = ipv4(a);
  if (v4) {
    const [x, y] = v4;
    if (x === 0 || x === 10 || x === 127) return true;                 // this network, private, loopback
    if (x === 169 && y === 254) return true;                           // link-local, and cloud metadata
    if (x === 172 && y >= 16 && y <= 31) return true;                  // private
    if (x === 192 && y === 168) return true;                           // private
    if (x === 100 && y >= 64 && y <= 127) return true;                 // carrier-grade NAT
    if (x === 192 && y === 0) return true;                             // protocol assignments, TEST-NET-1
    if (x === 198 && (y === 18 || y === 19)) return true;              // benchmarking
    if (x === 198 && y === 51) return true;                            // TEST-NET-2
    if (x === 203 && y === 0) return true;                             // TEST-NET-3
    if (x >= 224) return true;                                         // multicast, reserved, broadcast
    return false;
  }

  if (isIP(a) !== 6) return true;              // not an address we can reason about - refuse it
  if (a === "::" || a === "::1") return true;  // unspecified, loopback
  if (/^f[cd]/.test(a)) return true;           // fc00::/7 unique-local
  if (/^fe[89ab]/.test(a)) return true;        // fe80::/10 link-local
  if (/^ff/.test(a)) return true;              // ff00::/8 multicast
  return false;
}

/** Parses and checks a URL, resolving the host and rejecting anything not on the open internet. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new FetchImageError("Đường dẫn không hợp lệ.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new FetchImageError("Chỉ hỗ trợ đường dẫn http và https.", `scheme ${url.protocol}`);
  }
  // A host given as a literal address never reaches DNS, so check it directly too.
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && isPrivateAddress(host)) {
    throw new FetchImageError("Đường dẫn này không truy cập được.", `literal private host ${host}`);
  }
  if (!isIP(host)) {
    let addrs: { address: string }[];
    try {
      addrs = await lookup(host, { all: true });
    } catch {
      throw new FetchImageError("Không tìm thấy máy chủ của đường dẫn này.", `dns failed for ${host}`);
    }
    // EVERY address, not just the first: a host with one public and one private A record would
    // otherwise pass the check and then be connected to on whichever the resolver preferred.
    for (const { address } of addrs) {
      if (isPrivateAddress(address)) {
        throw new FetchImageError("Đường dẫn này không truy cập được.", `${host} resolves to ${address}`);
      }
    }
  }
  return url;
}

export interface FetchedImage {
  bytes: Uint8Array;
  mime: string;
}

/**
 * Downloads the image at `raw`, following redirects by hand and re-checking each hop.
 *
 * Reads the body in chunks and aborts the moment it passes the limit, rather than buffering
 * whatever arrives and measuring afterwards - a server that answers with an endless stream
 * should cost us 20MB, not the machine.
 */
export async function fetchImage(raw: string): Promise<FetchedImage> {
  let url = await assertPublicUrl(raw);
  const signal = AbortSignal.timeout(TIMEOUT_MS);

  for (let hop = 0; ; hop++) {
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal,
        headers: {
          // Some image hosts serve a placeholder, or 403, without these.
          "user-agent": "Mozilla/5.0 (compatible; CamAmTieuDaoBot/1.0; +https://camamtieudao.com)",
          accept: "image/*,*/*;q=0.8",
        },
      });
    } catch (e) {
      const aborted = (e as Error)?.name === "TimeoutError" || (e as Error)?.name === "AbortError";
      throw new FetchImageError(
        aborted ? "Tải ảnh từ đường dẫn quá lâu." : "Không tải được ảnh từ đường dẫn này.",
        String(e),
      );
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new FetchImageError("Đường dẫn chuyển hướng không hợp lệ.");
      if (hop >= MAX_REDIRECTS) throw new FetchImageError("Đường dẫn chuyển hướng quá nhiều lần.");
      // Re-check the destination. This is the whole reason redirects are manual: an open
      // redirect on a public host is otherwise a free pass to the metadata service.
      url = await assertPublicUrl(new URL(location, url).toString());
      continue;
    }

    if (!res.ok) {
      throw new FetchImageError(
        res.status === 403 || res.status === 401
          ? "Trang đó không cho tải ảnh trực tiếp. Bạn tải ảnh về máy rồi kéo vào đây nhé."
          : `Không tải được ảnh (lỗi ${res.status}).`,
        `status ${res.status}`,
      );
    }

    const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!mime.startsWith("image/")) {
      throw new FetchImageError(
        "Đường dẫn này không phải là ảnh. Bạn copy đúng địa chỉ ảnh (chuột phải → Sao chép địa chỉ hình ảnh) nhé.",
        `content-type ${mime || "(none)"}`,
      );
    }
    // Trust the header only to fail EARLY; the real limit is enforced on the bytes below.
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES) throw new FetchImageError("Ảnh lớn quá (tối đa 20MB).");

    if (!res.body) throw new FetchImageError("Không tải được ảnh từ đường dẫn này.", "no body");
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_BYTES) {
        await reader.cancel();
        throw new FetchImageError("Ảnh lớn quá (tối đa 20MB).");
      }
      chunks.push(value);
    }
    if (!total) throw new FetchImageError("Đường dẫn trả về ảnh rỗng.");

    const bytes = new Uint8Array(total);
    let at = 0;
    for (const c of chunks) { bytes.set(c, at); at += c.length; }
    return { bytes, mime };
  }
}
