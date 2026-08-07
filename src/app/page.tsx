import Converter from "./Converter.tsx";
import { Header } from "@/components/Header.tsx";

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <h1>Chuyển giản phổ thành cảm âm</h1>
        <p className="sub">
          Tải ảnh bản nhạc số (简谱) lên, nhận lại cảm âm cho sáo và tiêu.
        </p>
        <Converter />
        <footer>
          Ảnh được đọc trên máy chủ của chúng tôi và không lưu lại.
          Ảnh rõ, đủ sáng và thẳng góc sẽ cho kết quả tốt nhất.
        </footer>
      </main>
    </>
  );
}
