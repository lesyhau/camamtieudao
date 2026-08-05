// Placeholder shell. The chat interface and the attach button land in M3; this exists so the
// standalone build has a page to emit and the deploy path can be exercised end to end before
// there is a UI to deploy.
export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 640, margin: "4rem auto", padding: "0 1rem" }}>
      <h1>Cảm Âm Tiêu Dao</h1>
      <p>Chuyển giản phổ (简谱) từ ảnh sang cảm âm.</p>
      <p style={{ opacity: 0.6 }}>Giao diện chat đang được xây dựng.</p>
    </main>
  );
}
