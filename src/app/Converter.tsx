"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Trash2, Languages, ImageUp, Copy, Check, Loader2, X } from "lucide-react";
import type { CamAmDoc } from "@/lib/camam/types.ts";
import type { Polished } from "@/lib/polish/types.ts";
import type { Step } from "@/lib/pipeline.ts";
import { renderPolished, renderToken } from "@/lib/polish/render.ts";
import { Badge, BadgeToggle } from "@/components/ui/Badge";

interface Result { doc: CamAmDoc; polished: Polished | null; ms: number }

const ACCEPT = "image/png,image/jpeg,image/webp,image/bmp";

/** What the panel says while it waits, in the order the server passes through them. */
const STEP_LABEL: Record<Step, string> = {
  decode: "Đang đọc ảnh…",
  recognize: "Đang nhận dạng nốt nhạc…",
  build: "Đang dựng cảm âm…",
  polish: "Đang biên tập lại cho dễ đọc…",
};

/**
 * Upload via XHR, not fetch: only XHR reports UPLOAD progress, and only XHR can be aborted
 * from a ref without threading an AbortController through everything.
 *
 * The response is NDJSON, read incrementally. `onprogress` fires as the body grows and
 * `responseText` holds everything received so far, so each complete line can be handed to the
 * caller as it lands - which is how the step labels arrive during the twenty seconds when
 * nothing else is happening.
 */
function upload(
  file: File,
  onProgress: (pct: number) => void,
  onStep: (step: Step) => void,
  signal: { xhr?: XMLHttpRequest },
): Promise<Result> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    signal.xhr = xhr;
    xhr.open("POST", "/api/convert");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };

    let consumed = 0;      // characters of responseText already turned into events
    let final: Result | null = null;
    let failure: string | null = null;

    const drain = () => {
      const text = xhr.responseText;
      let nl: number;
      while ((nl = text.indexOf("\n", consumed)) !== -1) {
        const line = text.slice(consumed, nl).trim();
        consumed = nl + 1;
        if (!line) continue;
        let evt: { step?: Step; doc?: CamAmDoc; polished?: Polished | null; ms?: number; error?: string };
        try { evt = JSON.parse(line); } catch { continue; }
        if (evt.step) onStep(evt.step);
        else if (evt.error) failure = evt.error;
        else if (evt.doc) final = { doc: evt.doc, polished: evt.polished ?? null, ms: evt.ms ?? 0 };
      }
    };

    xhr.onprogress = drain;
    xhr.onload = () => {
      drain();
      if (final) { resolve(final); return; }
      if (failure) { reject(new Error(failure)); return; }
      // Not our stream at all: nginx answers a 502 or 504 with an HTML error page, and the
      // old code's blind JSON.parse reported "cannot reach the server" for a server that had
      // answered perfectly clearly.
      reject(new Error(
        xhr.status === 502 || xhr.status === 504
          ? "Máy chủ đang quá tải khi đọc bản nhạc. Bạn thử lại sau ít phút nhé."
          : `Máy chủ trả về lỗi ${xhr.status}. Bạn thử lại nhé.`,
      ));
    };
    xhr.onerror = () => reject(new Error("Mất kết nối tới máy chủ. Kiểm tra mạng rồi thử lại nhé."));
    xhr.onabort = () => reject(new DOMException("aborted", "AbortError"));
    xhr.ontimeout = () => reject(new Error("Máy chủ phản hồi quá lâu. Bạn thử lại nhé."));
    xhr.timeout = 300_000; // conversion is slow; the read timeout has to outlast it
    const body = new FormData();
    body.append("image", file);
    xhr.send(body);
  });
}

// A4 portrait, so the empty dropzone is already the shape of what goes into it and the layout
// does not move when an image replaces it.
const SHEET = "aspect-[1/1.4142] w-full rounded-card relative flex items-center justify-center";

// The result panel only borrowed A4 so the empty placeholder matched the sheet beside it. Now
// that it is three times the width, keeping the ratio made it 1018px tall - taller than the
// viewport, for content that scrolls anyway.
//
// Side by side it takes the screen instead: 100dvh less the header, the hero and a little air
// below (14rem measured against the real layout), with a floor so a short laptop window does
// not squeeze it to nothing. dvh rather than vh so a phone's collapsing URL bar does not leave
// the panel overhanging. Stacked on a phone it still matches the sheet above it.
const PANEL =
  "w-full rounded-card relative aspect-[1/1.4142] " +
  "lg:aspect-auto lg:h-[calc(100dvh-14rem)] lg:min-h-[30rem]";

export default function Converter() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "uploading" | "converting">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [over, setOver] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [mapping, setMapping] = useState<string | null>(null);
  const [verse, setVerse] = useState(1);
  const [support, setSupport] = useState(true);
  const [step, setStep] = useState<Step | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inflight = useRef<{ xhr?: XMLHttpRequest }>({});
  const busy = phase !== "idle";

  const choose = useCallback((f: File | null) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("Chỉ nhận ảnh (PNG, JPEG, WebP). File PDF chưa hỗ trợ.");
      return;
    }
    inflight.current.xhr?.abort(); // replacing the image abandons what the old one produced
    setError(null); setResult(null); setPhase("idle"); setFile(f);
    setPreview((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(f); });
  }, []);

  const clear = useCallback(() => {
    // Nothing is stored server-side - /api/convert converts and returns, it never writes the
    // image to disk - so clearing it here is the whole of "delete it from the server" too.
    inflight.current.xhr?.abort();
    setPreview((old) => { if (old) URL.revokeObjectURL(old); return null; });
    setFile(null); setResult(null); setError(null); setPhase("idle"); setZoom(false);
  }, []);

  /** Abort the request in flight. The rejection is an AbortError, which convert() ignores. */
  const cancel = useCallback(() => { inflight.current.xhr?.abort(); }, []);

  const convert = useCallback(async () => {
    if (!file) return;
    setError(null); setResult(null); setStep(null); setPhase("uploading");
    try {
      const r = await upload(file, (p) => {
        // Upload finishing is where the wait changes character: the bytes are sent, now the
        // server reads the sheet. Saying so is the difference between "slow" and "stuck".
        if (p >= 100) setPhase("converting");
      }, setStep, inflight.current);
      setResult(r); setMapping(null); setVerse(1); setSupport(true);
    } catch (e) {
      if ((e as DOMException)?.name !== "AbortError") {
        setError(e instanceof Error ? e.message : "Chuyển đổi thất bại.");
      }
    } finally { setPhase("idle"); setStep(null); }
  }, [file]);

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setZoom(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  const doc = result?.doc;
  // Lead with the mapping needing fewest octave bands: the one that fits the
  // lower / Capitalised / UPPER scheme without spilling into the apostrophe fallback.
  const recommended = useMemo(() => {
    if (!doc) return "";
    const ids = Object.keys(doc.mappings);
    return ids.reduce((best, id) =>
      doc.mappings[id].bandsUsed < doc.mappings[best].bandsUsed ? id : best, ids[0] ?? "");
  }, [doc]);
  const active = mapping ?? recommended;

  // Inert while a conversion is running: swapping the image mid-read would abandon the work
  // silently, and the drop target highlighting under a disabled delete button reads as a
  // control that should work.
  const dropProps = busy ? {} : {
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setOver(true); },
    onDragLeave: () => setOver(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault(); setOver(false);
      choose(e.dataTransfer.files?.[0] ?? null); // dropping onto the image replaces it
    },
  };

  return (
    <>
      {/* Two slots - sheet and result. There is no action column any more: the result panel IS
          the button until it has a result to show, which is where you are already looking. That
          gives both panels the width the middle column used to take, and a tighter gap brings
          them together. Landscape puts them side by side, portrait stacks them, and it is grid
          alone - no viewport JavaScript, so it is right on first paint. */}
      <div className="grid gap-5 lg:gap-4 grid-cols-1 lg:grid-cols-[1fr_3fr] items-center lg:items-start justify-items-center lg:justify-items-stretch">
        <section aria-label="Ảnh bản nhạc" className="min-w-0 w-full">
          {!preview ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              {...dropProps}
              className={`${SHEET} flex-col gap-1 text-center px-4 border-2 border-dashed glow-border focus-ring ${
                over ? "border-brand-accent bg-brand-solid/10" : "border-line hover:border-brand-accent"
              }`}
            >
              <ImageUp size={28} className="text-ink-disabled mb-2" aria-hidden="true" />
              <strong className="text-ink-primary text-sm">Kéo thả ảnh bản nhạc vào đây</strong>
              <span className="text-xs text-ink-caption">
                hoặc bấm để chọn file · PNG, JPEG, WebP · tối đa 20MB
              </span>
              {/* Advice that changes what you do, sitting with the instruction it qualifies.
                  The note about images not being stored is gone: it answered a question nobody
                  had asked yet, and it made a simple dropzone read as a disclaimer. */}
              <span className="text-xs text-ink-disabled max-w-sm mt-4">
                Ảnh rõ, đủ sáng và thẳng góc sẽ cho kết quả tốt nhất.
              </span>
            </button>
          ) : (
            <>
              <div
                {...dropProps}
                className={`${SHEET} overflow-hidden border bg-surface shadow-card ${
                  over ? "border-brand-accent" : "border-line"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- a blob: URL for the
                    file just picked; next/image would need a loader and buys nothing. */}
                <img
                  src={preview}
                  alt="Ảnh bản nhạc"
                  onClick={() => setZoom(true)}
                  className="max-w-full max-h-full object-contain cursor-zoom-in block"
                />
                {/* ThemeToggle's icon-button shape - no fill at rest, a wash on hover - but in
                    danger red at rest rather than a neutral that only turns red on hover. It
                    sits on a white sheet photograph, so a neutral grey was both easy to miss
                    and easy to mistake for part of the scan. */}
                <button
                  type="button"
                  onClick={clear}
                  disabled={busy}
                  aria-label="Xoá ảnh"
                  title={busy ? "Đang dịch, không xoá được" : "Xoá ảnh"}
                  className="absolute top-2 right-2 w-9 h-9 rounded-full flex items-center justify-center text-danger hover:bg-danger/15 transition-colors focus-ring disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
              <div className="mt-2 text-xs">
                <p className="text-ink-caption truncate">
                  {file?.name}{file ? ` · ${(file.size / 1024 / 1024).toFixed(1)} MB` : null}
                </p>
                <p className="text-ink-disabled">Kéo thả ảnh khác vào để thay thế</p>
              </div>
            </>
          )}
        </section>

        <section aria-label="Kết quả" className="min-w-0 w-full">
          {/* The box scrolls, but the copy button must not scroll with it: the scrolling
              element is the INNER absolute layer, so the button is a sibling of it and stays
              pinned to the corner of the frame. */}
          <div className={`${PANEL} border border-line bg-surface overflow-hidden`}>
            {doc && !error ? (
              <>
                <div className="absolute inset-0 overflow-auto thin-scroll p-4">
                  <ResultPanel
                    doc={doc}
                    polished={result?.polished ?? null}
                    mapping={active}
                    recommended={recommended}
                    setMapping={setMapping}
                    verse={verse}
                    setVerse={setVerse}
                  />
                </div>
                <CopyButton text={() => result?.polished ? renderPolished(result.polished, doc, active) : toPlainText(doc, active)} />
                {/* Only after a conversion lands: asking before the tool has done anything for
                    someone is asking a stranger. */}
                {support && <SupportCard onClose={() => setSupport(false)} />}
              </>
            ) : (
              /* The empty result panel is the convert button. One control, in the place the
                 answer will appear, so the click and its outcome are in the same spot.
                 Mid-run the same button cancels: the icon becomes the spinner at the same
                 size, so nothing shifts, and the label becomes Hủy. */
              <button
                type="button"
                onClick={busy ? cancel : convert}
                disabled={!file && !busy}
                aria-busy={busy}
                className={`absolute inset-0 w-full flex flex-col items-center justify-center gap-3 px-6 text-center transition-colors focus-ring ${
                  busy
                    ? "text-ink-primary hover:bg-danger/10"
                    : file
                      ? "text-brand-legible hover:bg-brand-solid/10"
                      : "text-ink-disabled cursor-not-allowed"
                }`}
              >
                {busy && <ConvertingWaves />}
                {busy
                  ? <Loader2 size={32} className="animate-spin relative" role="status" aria-hidden="true" />
                  : <Languages size={32} aria-hidden="true" />}
                <span className="relative text-base font-bold">{busy ? "Hủy" : "Dịch"}</span>
                {/* The stage the server is on, streamed back as it happens. Twenty seconds of
                    a spinner and nothing else is indistinguishable from twenty seconds of
                    being stuck. Fixed height so naming a longer stage does not nudge the
                    layout under the pointer that is about to click Hủy. */}
                {busy && (
                  <span className="relative h-5 text-xs text-ink-caption">
                    {step ? STEP_LABEL[step] : "Đang gửi ảnh…"}
                  </span>
                )}
                {!busy && !file && (
                  <span className="text-xs text-ink-disabled">Chọn ảnh bản nhạc trước</span>
                )}
                {error && !busy && (
                  <span className="mt-2 max-w-xs rounded-md border border-danger bg-danger/10 text-danger text-xs p-2">
                    {error}
                  </span>
                )}
              </button>
            )}
          </div>

          {/* Below the panel, not inside it. Inside, it was the last thing in a scrolling box
              with a support card pinned to that box's bottom corner - so the one paragraph
              that must be read was the one reliably covered. */}
          {doc && !error && (
            <p className="mt-3 text-xs text-ink-disabled leading-snug">
              Kết quả được máy đọc tự động{result?.polished ? " và biên tập lại bằng AI" : ""}, nên
              phụ thuộc vào chất lượng ảnh bạn tải lên và có thể còn sai sót. Bạn nhớ đối chiếu với
              bản nhạc gốc trước khi tập nhé.
            </p>
          )}
        </section>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => { choose(e.target.files?.[0] ?? null); e.target.value = ""; }}
      />

      {zoom && preview && (
        <div
          onClick={() => setZoom(false)}
          role="presentation"
          className="fixed inset-0 z-[60] bg-mono-950/90 grid place-items-center p-8 cursor-zoom-out"
        >
          {/* Sized against the VIEWPORT, not the image: a percentage of the grid area let a
              2480px sheet render at its natural size and overflow the screen. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Ảnh bản nhạc phóng to"
            onClick={(e) => e.stopPropagation()}
            className="max-w-[calc(100vw-4rem)] max-h-[calc(100vh-4rem)] w-auto h-auto object-contain cursor-default bg-white rounded-md shadow-card-lg"
          />
        </div>
      )}
    </>
  );
}

/**
 * The result as pasteable text: header, then one line per printed line of the sheet, barlines
 * as `|`. Notes only - a cảm âm is passed around as a bare note stream, and a lyric line
 * underneath would only line up in a monospaced field, which a chat box or a forum post is not.
 */
function toPlainText(doc: CamAmDoc, mapping: string): string {
  const label = doc.mappings[mapping]?.label ?? mapping;
  const lines = doc.lines.flatMap((line) => {
    const notes = doc.notes.filter((n) => n.line === line.index);
    if (!notes.length) return [];
    const out: string[] = [];
    let measure = -1;
    for (const n of notes) {
      if (measure !== -1 && n.measure !== measure) out.push("|");
      measure = n.measure;
      out.push(n.rest ? "-" : (n.camAm[mapping] ?? "?"));
    }
    return [out.join(" ")];
  });
  return [
    doc.title || "Bản nhạc",
    `${doc.key.jianpu} · ${doc.meter.beats}/${doc.meter.beatType} · ${label}`,
    "",
    ...lines,
    "",
  ].join("\n");
}

/**
 * Copy, then a tick for 5 seconds.
 *
 * `text` is a thunk rather than a string so switching mapping or verse cannot leave the button
 * holding a stale copy of the score.
 */
/**
 * The waiting animation: two waves crossing the empty result panel.
 *
 * A spinner says "something is happening" and nothing else. Twenty seconds of a spinner and a
 * changing label is still twenty seconds of a page that looks frozen between labels, and the
 * conversion's longest stage is the one with the least to report. Slow water underneath gives
 * the wait a pulse without claiming any progress it cannot measure.
 *
 * Each SVG is twice the width of the box and holds TWO periods of the same wave, so sliding it
 * by exactly -50% puts the second period where the first started and the loop never seams. The
 * two layers run at different speeds and opacities, which is what stops it reading as one flat
 * shape sliding past. `prefers-reduced-motion` stops both - see globals.css.
 */
function ConvertingWaves() {
  return (
    <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-2/3 overflow-hidden pointer-events-none">
      <svg
        viewBox="0 0 400 60"
        preserveAspectRatio="none"
        className="absolute bottom-0 left-0 w-[200%] h-24 animate-wave-slow text-brand-solid/25"
      >
        <path fill="currentColor" d={WAVE_D} />
      </svg>
      <svg
        viewBox="0 0 400 60"
        preserveAspectRatio="none"
        className="absolute bottom-0 left-0 w-[200%] h-16 animate-wave text-brand-accent/20"
      >
        <path fill="currentColor" d={WAVE_D} />
      </svg>
    </div>
  );
}

// One period is 200 units wide; the path draws two of them and then closes down to the
// baseline so it fills rather than strokes.
const WAVE_D =
  "M0 30 C 25 12 75 12 100 30 C 125 48 175 48 200 30 " +
  "C 225 12 275 12 300 30 C 325 48 375 48 400 30 L400 60 L0 60 Z";

function CopyButton({ text }: { text: () => string }) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear on unmount, or a conversion cleared while the tick is showing sets state on a gone
  // component.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copy = useCallback(async () => {
    const value = text();
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // navigator.clipboard is undefined outside a secure context - which is exactly the
      // http://IP setup used to test before DNS moved. Fall back to the old selection trick.
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } finally { ta.remove(); }
    }
    setDone(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(false), 5000);
  }, [text]);

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={done ? "Đã chép" : "Chép cảm âm"}
      title={done ? "Đã chép" : "Chép cảm âm"}
      // ThemeToggle's shape exactly: 36px round, no fill or border at rest, a light wash on
      // hover. It sits on the result surface rather than on the sheet photograph, so unlike the
      // delete button it can use the ink-* tokens that button uses.
      className={`absolute top-2 right-2 z-10 w-9 h-9 rounded-full flex items-center justify-center transition-colors focus-ring ${
        done ? "text-success" : "text-ink-secondary hover:bg-ink-caption/10 hover:text-ink-primary"
      }`}
    >
      {done ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
    </button>
  );
}

/**
 * The tip jar, over the lower right of the result.
 *
 * The QR is a VietQR/napas payment code, so it is NOT generated here - a wrong CRC or a wrong
 * account field in a payment code sends someone's money nowhere, and that is not a thing to
 * reconstruct from a screenshot. It is a file, `public/qr-ung-ho.png`. If that file is missing
 * the card degrades to the account details in text, which are the same instruction in a slower
 * form, rather than showing a broken image on a payment prompt.
 */
function SupportCard({ onClose }: { onClose: () => void }) {
  const [qrFailed, setQrFailed] = useState(false);

  return (
    <aside
      aria-label="Ủng hộ Cảm âm Tiêu Dao"
      className="absolute bottom-2 right-2 left-2 sm:left-auto z-20 max-w-xs sm:max-w-none sm:w-64 mx-auto sm:mx-0 rounded-card border border-line bg-canvas/95 backdrop-blur-md shadow-card-lg p-3"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Đóng"
        title="Đóng"
        className="absolute top-1 right-1 w-7 h-7 rounded-full flex items-center justify-center text-ink-disabled hover:bg-ink-caption/10 hover:text-ink-primary transition-colors focus-ring"
      >
        <X size={14} aria-hidden="true" />
      </button>

      <h3 className="text-sm font-bold text-ink-primary pr-6 mb-1">Ủng hộ Cảm âm Tiêu Dao</h3>
      <p className="text-xs text-ink-caption leading-snug mb-2">
        Cảm âm Tiêu Dao sẽ luôn là một công cụ hoàn toàn miễn phí! Nếu bạn thấy hữu ích, hãy ủng hộ mình chút đỉnh để phụ giúp tiền duy trì máy chủ và tiếp thêm động lực cho mình ra thêm nhiều bản cảm âm mới nhé.
      </p>

      {/* The QR and the name share one fixed-width column, so the name is exactly as wide as
          the code above it and reads as its caption. 176px rather than the card's full inner
          width: at full width the card ran to ~420px of a 679px panel, which is more of the
          result covered than a tip jar has earned. */}
      <div className="w-32 sm:w-44 mx-auto">
        {!qrFailed && (
          /* The white padding is the QUIET ZONE, not decoration. The exported PNG is cropped
             flush to the code, and a QR needs clear margin around it to be found at all - on a
             dark card, with none, the finder patterns run straight into the background. */
          <div className="bg-white rounded-md p-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- a static asset at a fixed size */}
            <img
              src="/qr-ung-ho.png"
              alt="Mã QR chuyển khoản Vietcombank"
              onError={() => setQrFailed(true)}
              className="w-full block"
            />
          </div>
        )}
        <div className="w-full text-center mt-2">
          <p className="text-xs font-bold text-ink-primary tracking-wide">LE SY HAU</p>
          <p className="text-xs text-ink-caption tabular-nums">0181003535874</p>
          <p className="text-xs text-ink-disabled">Vietcombank</p>
        </div>
      </div>
    </aside>
  );
}

function ResultPanel({ doc, polished, mapping, recommended, setMapping, verse, setVerse }: {
  doc: CamAmDoc;
  polished: Polished | null;
  mapping: string;
  recommended: string;
  setMapping: (m: string) => void;
  verse: number;
  setVerse: (v: number) => void;
}) {
  return (
    <div>
      {/* pr-12 keeps a long title clear of the copy button pinned to the corner above it. */}
      <h2 className="text-base font-bold text-ink-primary mb-2 pr-12">{doc.title || "Bản nhạc"}</h2>

      {/* One row of badges. The note/measure/line counts and the conversion time are gone:
          they described the machine's work, not the music, and nobody plays from them. Key,
          metre and tempo are what a player reads off the top of a sheet. */}
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        <Badge label={doc.key.jianpu} variant="electric" />
        <Badge label={`${doc.meter.beats}/${doc.meter.beatType}`} variant="electric" />
        {doc.tempo && <Badge label={`♩=${doc.tempo.bpm}`} variant="electric" />}
      </div>

      {/* The "Cách bấm" and "Lời" captions are folded into the badges themselves - a label
          plus a value where the value alone was ambiguous. The tick on the recommendation is
          gone too: the selected badge is already filled, so a tick on top of it read as a
          second, competing state. */}
      <div className="flex flex-wrap items-center gap-1.5 mb-5">
        {Object.entries(doc.mappings).map(([id, m]) => (
          <BadgeToggle
            key={id}
            label={`Thế bấm ${m.label.replace(/\D+/g, "") || m.label}`}
            selected={id === mapping}
            onClick={() => setMapping(id)}
            title={id === recommended ? `${m.label} - ít quãng tám nhất, nên dùng` : m.label}
          />
        ))}
        {/* The polished view merges the verses into one, so there is nothing left to switch
            between - the badges only appear on the grid fallback. */}
        {!polished && doc.verseCount > 1 &&
          Array.from({ length: doc.verseCount }, (_, i) => i + 1).map((v) => (
            <BadgeToggle key={v} label={`Lời ${v}`} selected={v === verse} onClick={() => setVerse(v)} />
          ))}
      </div>

      {polished
        ? <PolishedScore doc={doc} polished={polished} mapping={mapping} />
        : <Score doc={doc} mapping={mapping} verse={verse} />}

    </div>
  );
}

/**
 * The polished score: one phrase per line, its words underneath.
 *
 * The model returns JIANPU tokens, and the cảm âm name is computed here - by the same
 * `nameOf` the original conversion uses, with the same band offset off the doc. So switching
 * fingering still works on polished output, and a name can never disagree with the grid's.
 */
function PolishedScore({ doc, polished, mapping }: { doc: CamAmDoc; polished: Polished; mapping: string }) {


  return (
    <div className="space-y-5">
      {polished.sections.map((sec, i) => (
        <section key={i}>
          {sec.title && (
            <h3 className="text-xs label-upper text-brand-legible mb-2">{sec.title}</h3>
          )}
          <div className="space-y-3">
            {sec.lines.map((line, j) => (
              <div key={j}>
                <p className="text-ink-primary leading-6">{line.tokens.map((t) => renderToken(t, doc, mapping)).join(" ")}</p>
                {line.lyric && <p className="text-xs text-ink-caption leading-5">{line.lyric}</p>}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Score({ doc, mapping, verse }: { doc: CamAmDoc; mapping: string; verse: number }) {
  // A syllable belongs to a group and is printed on the group's FIRST note; the rest of the
  // group is its melisma and stays blank.
  const syllableOf = (noteId: number, group: number): string => {
    const g = doc.groups.find((x) => x.id === group);
    return g && g.notes[0] === noteId ? (g.lyrics[String(verse)] ?? "") : "";
  };

  return (
    <div>
      {doc.lines.map((line) => {
        const notes = doc.notes.filter((n) => n.line === line.index);
        if (!notes.length) return null;
        let measure = -1;
        return (
          <div key={line.index} className="mb-4">
            {/* items-start, so a wrapped row starts a fresh line of cells at the same height
                rather than hanging off the tallest one in the row above. */}
            <div className="flex flex-wrap gap-x-1 gap-y-2 items-start">
              {notes.map((n) => {
                const newMeasure = measure !== -1 && n.measure !== measure;
                measure = n.measure;
                const name = n.rest ? "–" : (n.camAm[mapping] ?? "?");
                return (
                  <span key={n.id} className="contents">
                    {newMeasure && <span aria-hidden="true" className="w-px h-11 bg-line mx-1.5" />}
                    {/* Fixed row heights, not min-heights. Every cell is the same 44px tall
                        whether or not it carries a syllable, and whether that syllable is a
                        Latin one or a taller CJK glyph - which is what keeps the notes on one
                        line instead of each cell finding its own baseline. */}
                    <span className="flex flex-col items-center min-w-[2rem]">
                      <span className={`h-6 leading-6 whitespace-nowrap ${n.rest ? "text-ink-disabled" : "text-ink-primary"}`}>
                        {name}
                      </span>
                      <span className="h-5 leading-5 text-xs text-ink-caption whitespace-nowrap">
                        {syllableOf(n.id, n.group)}
                      </span>
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
