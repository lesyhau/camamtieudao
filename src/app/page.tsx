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
        {/* py-16 was sized for a 49px display heading. At 16px - the largest size in the
            three-size scale - that much air around one short line reads as a mistake rather
            than as emphasis, so the block tightens to match the type. */}
        <section className="max-w-5xl mx-auto px-6 pt-10 pb-8 text-center">
          {/* No eyebrow: it repeated the wordmark sitting directly above it in the header. */}
          <h1 className="text-base font-bold text-ink-primary mb-1">
            Dịch giản phổ thành cảm âm
          </h1>
          <p className="text-sm text-ink-caption max-w-2xl mx-auto">
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
