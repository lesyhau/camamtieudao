import Converter from "./Converter";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";

export default function Home() {
  return (
    <>
      <Navbar />
      {/* pt-14 clears the fixed bar; the column is the same max-w-5xl + px-6 the header uses.
          flex-1 is what gives the footer below its slack to sink to the bottom edge. */}
      <main className="flex-1 pt-14">
        <section className="max-w-5xl mx-auto px-6 py-16 text-center">
          {/* No eyebrow: it repeated the wordmark sitting directly above it in the header. */}
          <h1 className="text-4xl sm:text-5xl font-bold text-ink-primary mb-4">
            Dịch giản phổ thành cảm âm
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
