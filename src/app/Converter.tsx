"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CamAmDoc } from "@/lib/camam/types.ts";

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
      if (xhr.status >= 200 && xhr.status < 300 && body?.doc) {
        resolve(body as Result);
        return;
      }
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
    // Conversion is slow; the read timeout has to outlast it.
    xhr.timeout = 300_000;
    const body = new FormData();
    body.append("image", file);
    xhr.send(body);
  });
}

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
    // Replacing the image abandons whatever the old one produced.
    inflight.current.xhr?.abort();
    setError(null);
    setResult(null);
    setPhase("idle");
    setPct(0);
    setFile(f);
    setPreview((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(f); });
  }, []);

  const clear = useCallback(() => {
    // Nothing is stored server-side - the endpoint converts and returns, it never writes the
    // image to disk - so removing it here is the whole of "delete it from the server" too.
    inflight.current.xhr?.abort();
    setPreview((old) => { if (old) URL.revokeObjectURL(old); return null; });
    setFile(null);
    setResult(null);
    setError(null);
    setPhase("idle");
    setPct(0);
    setZoom(false);
  }, []);

  const convert = useCallback(async () => {
    if (!file) return;
    setError(null);
    setResult(null);
    setPct(0);
    setPhase("uploading");
    try {
      const r = await upload(file, (p) => {
        setPct(p);
        // Upload finishing is where the wait changes character: bytes are sent, now the server
        // reads the sheet. Saying so is the difference between "slow" and "stuck".
        if (p >= 100) setPhase("converting");
      }, inflight.current);
      setResult(r);
      setMapping(null);
      setVerse(1);
    } catch (e) {
      if ((e as DOMException)?.name !== "AbortError") {
        setError(e instanceof Error ? e.message : "Chuyển đổi thất bại.");
      }
    } finally {
      setPhase("idle");
    }
  }, [file]);

  // Escape closes the expanded image, which is what every lightbox has taught people to expect.
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setZoom(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  const doc = result?.doc;
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
    a.href = url;
    a.download = `${doc.title || "cam-am"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [doc]);

  const dropProps = {
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setOver(true); },
    onDragLeave: () => setOver(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setOver(false);
      // Dropping onto the current image replaces it outright.
      choose(e.dataTransfer.files?.[0] ?? null);
    },
  };

  return (
    <>
      {/* Three slots - sheet, action, result - laid out by CSS alone.
          Landscape puts them side by side, portrait stacks them. The result slot always
          occupies the same box as the sheet, empty or not, so nothing on the page moves when a
          conversion lands. */}
      <div className="workspace">
        <section className="slot slot-sheet" aria-label="Ảnh bản nhạc">
          {!preview ? (
            <button
              type="button"
              className={`drop sheet${over ? " over" : ""}`}
              onClick={() => inputRef.current?.click()}
              {...dropProps}
            >
              <strong>Kéo thả ảnh bản nhạc vào đây</strong>
              <div className="hint">hoặc bấm để chọn file · PNG, JPEG, WebP · tối đa 20MB</div>
            </button>
          ) : (
            <>
              <div className={`sheet shown${over ? " over" : ""}`} {...dropProps}>
                {/* eslint-disable-next-line @next/next/no-img-element -- a blob: URL for the file
                    the user just picked; next/image would need a loader and buys nothing. */}
                <img src={preview} alt="Ảnh bản nhạc" onClick={() => setZoom(true)} />
                <button type="button" className="remove" onClick={clear} aria-label="Xoá ảnh" title="Xoá ảnh">
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden focusable="false">
                    <path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 12H7L6 9Zm4 2v8h1v-8h-1Zm3 0v8h1v-8h-1Z" />
                  </svg>
                </button>
              </div>
              <div className="sheet-meta">
                <span className="replace">Kéo thả ảnh khác vào để thay thế</span>
                <span className="fileinfo">
                  {file?.name}{file ? ` · ${(file.size / 1024 / 1024).toFixed(1)} MB` : null}
                </span>
              </div>
            </>
          )}
        </section>

        <section className="slot slot-action">
          <button className="primary" onClick={convert} disabled={!file || busy}>
            {phase === "uploading" ? `Đang tải lên… ${pct}%`
              : phase === "converting" ? "Đang đọc…"
              : "Chuyển thành cảm âm"}
          </button>
          {busy && (
            <div className="bar" role="progressbar" aria-valuenow={phase === "uploading" ? pct : undefined}>
              {/* Upload has a real percentage; conversion has none to report, so it sweeps
                  rather than showing a bar that pretends to know. */}
              <div className={phase === "uploading" ? "fill" : "fill sweep"}
                   style={phase === "uploading" ? { width: `${pct}%` } : undefined} />
            </div>
          )}
          {phase === "converting" && <span className="meta">10–30 giây</span>}
        </section>

        <section className="slot slot-result" aria-label="Kết quả">
          <div className="sheet result-box">
            {error ? (
              <div className="error">{error}</div>
            ) : doc ? (
              <div className="result">
                <h2>{doc.title || "Bản nhạc"}</h2>
                <p className="stats">
                  {doc.key.jianpu} · {doc.meter.beats}/{doc.meter.beatType} ·{" "}
                  {doc.notes.length} nốt · {doc.measures.length} ô nhịp · {doc.lines.length} dòng
                  {result ? ` · ${(result.ms / 1000).toFixed(0)}s` : null}
                </p>
                <div className="controls">
                  <div className="group">
                    <span className="label">Cách bấm</span>
                    {Object.entries(doc.mappings).map(([id, m]) => (
                      <button key={id} className="ghost sm" aria-pressed={id === active} onClick={() => setMapping(id)}>
                        {m.label}{id === recommended ? " ✓" : ""}
                      </button>
                    ))}
                  </div>
                  {doc.verseCount > 1 && (
                    <div className="group">
                      <span className="label">Lời</span>
                      {Array.from({ length: doc.verseCount }, (_, i) => i + 1).map((v) => (
                        <button key={v} className="ghost sm" aria-pressed={v === verse} onClick={() => setVerse(v)}>
                          {v}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="group">
                    <button className="ghost sm" onClick={download}>Tải JSON</button>
                  </div>
                </div>
                <Score doc={doc} mapping={active} verse={verse} />
              </div>
            ) : (
              <div className="placeholder">
                <svg viewBox="0 0 24 24" width="34" height="34" aria-hidden focusable="false">
                  <path opacity=".35" fill="none" stroke="currentColor" strokeWidth="1.6"
                        strokeLinecap="round" strokeLinejoin="round"
                        d="M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                </svg>
                <p>Cảm âm sẽ hiện ở đây</p>
              </div>
            )}
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
        <div className="lightbox" onClick={() => setZoom(false)} role="presentation">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Ảnh bản nhạc phóng to" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </>
  );
}

function Score({ doc, mapping, verse }: { doc: CamAmDoc; mapping: string; verse: number }) {
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
          <div className="system" key={line.index}>
            <div className="notes">
              {notes.map((n) => {
                const newMeasure = measure !== -1 && n.measure !== measure;
                measure = n.measure;
                const name = n.rest ? "–" : (n.camAm[mapping] ?? "?");
                const band = n.rest ? "" : name === name.toUpperCase() ? "up2"
                  : name[0] === name[0]?.toUpperCase() ? "up1" : "";
                return (
                  <span key={n.id} style={{ display: "contents" }}>
                    {newMeasure && <span className="bar-sep" aria-hidden />}
                    <span className={`note${n.rest ? " rest" : ""}`}>
                      <span className={`name ${band}`}>{name}</span>
                      <span className="syl">{syllableOf(n.id, n.group)}</span>
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
