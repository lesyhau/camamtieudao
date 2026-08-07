import Converter from "./Converter.tsx";
import { Header } from "@/components/Header.tsx";
import { Footer } from "@/components/Footer.tsx";

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <div className="column">
          <h1>Chuyển giản phổ thành cảm âm</h1>
          <p className="sub">Tải ảnh bản nhạc số (简谱) lên, nhận lại cảm âm cho sáo và tiêu.</p>
          <Converter />
        </div>
      </main>
      <Footer />
    </>
  );
}
