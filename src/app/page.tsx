import Converter from "./Converter.tsx";

export default function Home() {
  return (
    <main>
      <h1>Cảm Âm Tiêu Dao</h1>
      <p className="sub">
        Tải ảnh bản nhạc số (giản phổ) lên, nhận lại cảm âm cho sáo và tiêu.
      </p>
      <Converter />
      <footer>
        Đọc ảnh hoàn toàn trên máy chủ của chúng tôi, không gửi đi đâu khác.
        Ảnh chụp rõ, đủ sáng và thẳng góc sẽ cho kết quả tốt nhất.
      </footer>
    </main>
  );
}
