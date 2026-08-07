"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { CamAmDoc } from "@/lib/camam/types.ts";

interface Result { doc: CamAmDoc; ms: number }

const ACCEPT = "image/png,image/jpeg,image/webp,image/bmp";

export default function Converter() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [over, setOver] = useState(false);
  const [mapping, setMapping] = useState<string | null>(null);
  const [verse, setVerse] = useState(1);
  const inputRef = useRef<HTMLInputElement>(null);

  const choose = useCallback((f: File | null) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("Chỉ nhận ảnh (PNG, JPEG, WebP). File PDF chưa hỗ trợ.");
      return;
    }
    setError(null);
    setResult(null);
    setFile(f);
    // Revoked on replacement rather than on unmount: the preview outlives any single render.
    setPreview((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(f); });
  }, []);

  const convert = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const body = new FormData();
      body.append("image", file);
      const res = await fetch("/api/convert", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Chuyển đổi thất bại."); return; }
      setResult(json as Result);
      setMapping(null);
      setVerse(1);
    } catch {
      setError("Không kết nối được máy chủ. Thử lại nhé.");
    } finally {
      setBusy(false);
    }
  }, [file]);

  const doc = result?.doc;

  // Lead with the mapping that needs fewest octave bands: it is the one that fits the
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
    a.href = url;
    a.download = `${doc.title || "cam-am"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [doc]);

  return (
    <>
      <button
        type="button"
        className={`drop${over ? " over" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); choose(e.dataTransfer.files?.[0] ?? null); }}
      >
        <strong>Kéo thả ảnh bản nhạc vào đây</strong>
        <div className="hint">hoặc bấm để chọn file · PNG, JPEG, WebP · tối đa 20MB</div>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => choose(e.target.files?.[0] ?? null)}
      />

      {preview && (
        <div className="preview">
          {/* eslint-disable-next-line @next/next/no-img-element -- a blob: URL from the file the
              user just picked; next/image would need a loader and buys nothing here. */}
          <img src={preview} alt="Ảnh đã chọn" />
          <div className="meta">
            {file?.name}<br />
            {file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : null}
          </div>
        </div>
      )}

      <div className="row">
        <button className="primary" onClick={convert} disabled={!file || busy}>
          {busy ? "Đang đọc bản nhạc…" : "Chuyển thành cảm âm"}
        </button>
        {busy && <span className="meta">Mất khoảng 10–20 giây.</span>}
      </div>

      {error && <div className="error">{error}</div>}

      {doc && (
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
                <button
                  key={id}
                  className="ghost"
                  aria-pressed={id === active}
                  onClick={() => setMapping(id)}
                >
                  {m.label}{id === recommended ? " ✓" : ""}
                </button>
              ))}
            </div>
            {doc.verseCount > 1 && (
              <div className="group">
                <span className="label">Lời</span>
                {Array.from({ length: doc.verseCount }, (_, i) => i + 1).map((v) => (
                  <button key={v} className="ghost" aria-pressed={v === verse} onClick={() => setVerse(v)}>
                    Lời {v}
                  </button>
                ))}
              </div>
            )}
            <div className="group">
              <button className="ghost" onClick={download}>Tải JSON</button>
            </div>
          </div>

          <Score doc={doc} mapping={active} verse={verse} />
        </div>
      )}
    </>
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
          <div className="system" key={line.index}>
            <div className="notes">
              {notes.map((n) => {
                const newMeasure = measure !== -1 && n.measure !== measure;
                measure = n.measure;
                const name = n.rest ? "–" : (n.camAm[mapping] ?? "?");
                // Case already encodes the octave; weight repeats it so a glance is enough.
                const band = n.rest ? "" : name === name.toUpperCase() ? "up2"
                  : name[0] === name[0]?.toUpperCase() ? "up1" : "";
                return (
                  <span key={n.id} style={{ display: "contents" }}>
                    {newMeasure && <span className="bar" aria-hidden />}
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
