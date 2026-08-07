"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Trash2, Music4, ImageUp, Copy, Check } from "lucide-react";
import type { CamAmDoc } from "@/lib/camam/types.ts";
import { Button } from "@/components/ui/Button";

interface Result { doc: CamAmDoc; ms: number }

const ACCEPT = "image/png,image/jpeg,image/webp,image/bmp";

/** Upload via XHR, not fetch: only XHR reports upload progress. */
function upload(
  file: File,
  onProgress: (pct: number) => void,
  signal: { xhr?: XMLHttpRequest },
): Promise<Result> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    signal.xhr = xhr;
    xhr.open("POST", "/api/convert");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      // The server answers JSON, but nginx does not: a 502 or 504 arrives as an HTML error
      // page. Parsing blindly threw, and the catch reported "cannot reach the server" for a
      // server that had answered perfectly clearly.
      let body: { error?: string; doc?: CamAmDoc; ms?: number } | null = null;
      try { body = JSON.parse(xhr.responseText); } catch { /* not JSON - handled below */ }
      if (xhr.status >= 200 && xhr.status < 300 && body?.doc) { resolve(body as Result); return; }
      if (body?.error) { reject(new Error(body.error)); return; }
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

export default function Converter() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "uploading" | "converting">("idle");
  const [pct, setPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [over, setOver] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [mapping, setMapping] = useState<string | null>(null);
  const [verse, setVerse] = useState(1);
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
    setError(null); setResult(null); setPhase("idle"); setPct(0); setFile(f);
    setPreview((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(f); });
  }, []);

  const clear = useCallback(() => {
    // Nothing is stored server-side - /api/convert converts and returns, it never writes the
    // image to disk - so clearing it here is the whole of "delete it from the server" too.
    inflight.current.xhr?.abort();
    setPreview((old) => { if (old) URL.revokeObjectURL(old); return null; });
    setFile(null); setResult(null); setError(null); setPhase("idle"); setPct(0); setZoom(false);
  }, []);

  const convert = useCallback(async () => {
    if (!file) return;
    setError(null); setResult(null); setPct(0); setPhase("uploading");
    try {
      const r = await upload(file, (p) => {
        setPct(p);
        // Upload finishing is where the wait changes character: the bytes are sent, now the
        // server reads the sheet. Saying so is the difference between "slow" and "stuck".
        if (p >= 100) setPhase("converting");
      }, inflight.current);
      setResult(r); setMapping(null); setVerse(1);
    } catch (e) {
      if ((e as DOMException)?.name !== "AbortError") {
        setError(e instanceof Error ? e.message : "Chuyển đổi thất bại.");
      }
    } finally { setPhase("idle"); }
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

  const download = useCallback(() => {
    if (!doc) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${doc.title || "cam-am"}.json`; a.click();
    URL.revokeObjectURL(url);
  }, [doc]);

  const dropProps = {
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setOver(true); },
    onDragLeave: () => setOver(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault(); setOver(false);
      choose(e.dataTransfer.files?.[0] ?? null); // dropping onto the image replaces it
    },
  };

  return (
    <>
      {/* Three slots - sheet, action, result. Landscape puts them side by side, portrait stacks
          them, and it is grid alone: no viewport JavaScript, so it is right on first paint. The
          result slot always occupies the same box as the sheet, empty or not, so nothing moves
          when a conversion lands. */}
      <div className="grid gap-5 lg:gap-6 grid-cols-1 lg:grid-cols-[1fr_auto_1fr] items-start">
        <section aria-label="Ảnh bản nhạc" className="min-w-0">
          {!preview ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              {...dropProps}
              className={`${SHEET} flex-col gap-1 text-center px-6 border-2 border-dashed glow-border focus-ring ${
                over ? "border-brand-accent bg-brand-solid/10" : "border-line hover:border-brand-accent"
              }`}
            >
              <ImageUp size={28} className="text-ink-disabled mb-2" aria-hidden="true" />
              <strong className="text-ink-primary">Kéo thả ảnh bản nhạc vào đây</strong>
              <span className="text-xs text-ink-caption">
                hoặc bấm để chọn file · PNG, JPEG, WebP · tối đa 20MB
              </span>
              {/* The privacy and quality note sits with the instruction it qualifies rather
                  than at the foot of the page, where it was easy to miss. */}
              <span className="text-xs text-ink-disabled max-w-sm mt-4">
                Ảnh được đọc trên máy chủ của chúng tôi và không lưu lại.
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
                <button
                  type="button"
                  onClick={clear}
                  aria-label="Xoá ảnh"
                  title="Xoá ảnh"
                  className="absolute top-2 left-2 w-9 h-9 rounded-md border border-line bg-canvas/90 text-danger flex items-center justify-center hover:border-danger focus-ring"
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
              <div className="flex justify-between gap-4 flex-wrap mt-2 text-xs text-ink-caption">
                <span>Kéo thả ảnh khác vào để thay thế</span>
                <span className="text-right">
                  {file?.name}{file ? ` · ${(file.size / 1024 / 1024).toFixed(1)} MB` : null}
                </span>
              </div>
            </>
          )}
        </section>

        <section className="flex flex-col items-center gap-3 justify-self-center lg:self-center">
          {/* The app's own Button, at the larger of its two sizes - same shape, font, colour
              and states as Add Resource, just the size the component provides for a page-level
              call to action. */}
          <Button size="md" onClick={convert} disabled={!file || busy}>
            {phase === "uploading" ? `Đang tải lên… ${pct}%`
              : phase === "converting" ? "Đang đọc…"
              : "Dịch"}
          </Button>
          {busy && (
            <div
              className="w-48 h-1.5 rounded-full bg-surface-alt overflow-hidden"
              role="progressbar"
              aria-valuenow={phase === "uploading" ? pct : undefined}
            >
              {/* Upload has a real percentage; conversion has none to report, so it sweeps
                  rather than showing a bar that pretends to know how far along it is. */}
              <div
                className={`h-full bg-brand-accent ${phase === "converting" ? "w-1/3 animate-sweep" : ""}`}
                style={phase === "uploading" ? { width: `${pct}%` } : undefined}
              />
            </div>
          )}
          {phase === "converting" && <span className="text-xs text-ink-caption">10–30 giây</span>}
        </section>

        <section aria-label="Kết quả" className="min-w-0">
          {/* The box scrolls, but the copy button must not scroll with it: the scrolling
              element is the INNER absolute layer, so the button is a sibling of it and stays
              pinned to the corner of the frame. */}
          <div className={`${SHEET} border border-line bg-surface !block overflow-hidden`}>
            <div className="absolute inset-0 overflow-auto p-4">
              {error ? (
                <div className="rounded-md border border-danger bg-danger/10 text-danger text-sm p-3">
                  {error}
                </div>
              ) : doc ? (
                <ResultPanel
                  doc={doc}
                  ms={result?.ms}
                  mapping={active}
                  recommended={recommended}
                  setMapping={setMapping}
                  verse={verse}
                  setVerse={setVerse}
                  download={download}
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-ink-disabled">
                  <Music4 size={32} aria-hidden="true" />
                  <p className="text-sm">Cảm âm sẽ hiện ở đây</p>
                </div>
              )}
            </div>
            {/* Top right, mirroring the delete button on the sheet's top left. */}
            {doc && !error && <CopyButton text={() => toPlainText(doc, active)} />}
          </div>
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
      className={`absolute top-2 right-2 z-10 w-9 h-9 rounded-md border bg-canvas/90 flex items-center justify-center transition-colors focus-ring ${
        done ? "border-success text-success" : "border-line text-ink-caption hover:border-brand-accent hover:text-ink-primary"
      }`}
    >
      {done ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
    </button>
  );
}

function ResultPanel({ doc, ms, mapping, recommended, setMapping, verse, setVerse, download }: {
  doc: CamAmDoc;
  ms?: number;
  mapping: string;
  recommended: string;
  setMapping: (m: string) => void;
  verse: number;
  setVerse: (v: number) => void;
  download: () => void;
}) {
  const chip = (on: boolean) =>
    `rounded-md border px-2.5 py-1 text-xs transition-colors focus-ring ${
      on
        ? "border-brand-accent bg-brand-solid/15 text-ink-primary"
        : "border-line text-ink-secondary hover:border-brand-accent"
    }`;

  return (
    <div>
      {/* pr-12 keeps a long title clear of the copy button pinned to the corner above it. */}
      <h2 className="text-lg font-bold text-ink-primary mb-0.5 pr-12">{doc.title || "Bản nhạc"}</h2>
      <p className="text-xs text-ink-caption mb-4">
        {doc.key.jianpu} · {doc.meter.beats}/{doc.meter.beatType} · {doc.notes.length} nốt ·{" "}
        {doc.measures.length} ô nhịp · {doc.lines.length} dòng
        {ms ? ` · ${(ms / 1000).toFixed(0)}s` : null}
      </p>

      <div className="flex flex-wrap gap-5 mb-5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-2xs label-upper text-ink-disabled">Cách bấm</span>
          {Object.entries(doc.mappings).map(([id, m]) => (
            <button key={id} onClick={() => setMapping(id)} aria-pressed={id === mapping} className={chip(id === mapping)}>
              {m.label}{id === recommended ? " ✓" : ""}
            </button>
          ))}
        </div>
        {doc.verseCount > 1 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-2xs label-upper text-ink-disabled">Lời</span>
            {Array.from({ length: doc.verseCount }, (_, i) => i + 1).map((v) => (
              <button key={v} onClick={() => setVerse(v)} aria-pressed={v === verse} className={chip(v === verse)}>
                {v}
              </button>
            ))}
          </div>
        )}
        <button onClick={download} className={chip(false)}>Tải JSON</button>
      </div>

      <Score doc={doc} mapping={mapping} verse={verse} />
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
          <div key={line.index} className="mb-5">
            <div className="flex flex-wrap gap-x-2 gap-y-0.5 items-end">
              {notes.map((n) => {
                const newMeasure = measure !== -1 && n.measure !== measure;
                measure = n.measure;
                const name = n.rest ? "–" : (n.camAm[mapping] ?? "?");
                // Case already encodes the octave; weight repeats it so a glance is enough.
                const band = n.rest
                  ? "text-ink-disabled"
                  : name === name.toUpperCase()
                    ? "font-bold text-brand-accent-legible"
                    : name[0] === name[0]?.toUpperCase()
                      ? "font-semibold text-ink-primary"
                      : "text-ink-primary";
                return (
                  <span key={n.id} className="contents">
                    {newMeasure && <span aria-hidden="true" className="self-stretch w-px bg-line mx-1" />}
                    <span className="flex flex-col items-center min-w-[1.5rem]">
                      <span className={`tabular-nums whitespace-nowrap ${band}`}>{name}</span>
                      <span className="text-xs text-ink-caption min-h-[1.2em] whitespace-nowrap">
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
