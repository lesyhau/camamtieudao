import Converter from "./Converter";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

export default function Home() {
  return (
    <>
      <Navbar />
      {/* pt-14 clears the fixed bar; the column is the same max-w-5xl + px-6 the header uses. */}
      <main className="pt-14">
        <section className="max-w-5xl mx-auto px-6 py-16 text-center">
          <p className="text-2xs label-upper text-brand-legible mb-3">Cảm âm tiêu dao</p>
          <h1 className="text-4xl sm:text-5xl font-bold text-ink-primary mb-4">
            Chuyển giản phổ thành cảm âm
          </h1>
          <p className="text-lg text-ink-caption max-w-2xl mx-auto">
            Tải ảnh bản nhạc số (简谱) lên, nhận lại cảm âm cho sáo và tiêu.
          </p>
        </section>

        <section className="max-w-5xl mx-auto px-6 pb-20">
          <Converter />
        </section>
      </main>
      <Footer />
    </>
  );
}
