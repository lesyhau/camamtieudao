import Converter from "./Converter";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { AdSlot } from "@/components/ads/AdSlot";
import { adsConfig } from "@/lib/ads.ts";

export default function Home() {
  // Read per request on the server, so ads are an env change rather than a rebuild.
  const ads = adsConfig();

  return (
    <>
      <Navbar />
      {/* pt-14 clears the fixed bar; the column is the same max-w-5xl and the same gutter the
          header uses - 16px on a phone, where 24px on each side of a 390px screen was 12% of it
          spent on margin, and 24px from `sm` up.
          flex-1 is what gives the footer below its slack to sink to the bottom edge. */}
      <main className="flex-1 pt-14">
        {/* py-16 was sized for a 49px display heading. At 16px - the largest size in the
            three-size scale - that much air around one short line reads as a mistake rather
            than as emphasis, so the block tightens to match the type. */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-10 pb-8 text-center">
          {/* No eyebrow: it repeated the wordmark sitting directly above it in the header. */}
          <h1 className="text-base font-bold text-ink-primary mb-1">
            Dịch giản phổ thành cảm âm
          </h1>
          <p className="text-sm text-ink-caption max-w-2xl mx-auto">
            Tải ảnh bản nhạc số (简谱) lên, nhận lại cảm âm cho sáo và tiêu.
          </p>
        </section>

        <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-16 sm:pb-20">
          <Converter
            aside={
              <AdSlot
                client={ads.client}
                slot={ads.slots.sidebar}
                shape="panel"
                contact={ads.contact}
                className="hidden lg:flex mt-4"
              />
            }
          />

          {/* After the work, before the footer. The one horizontal position that is on the
              path out of the page rather than across it - on every size, because it is the
              only slot a phone gets. */}
          <AdSlot
            client={ads.client}
            slot={ads.slots.bottom}
            shape="banner"
            contact={ads.contact}
            className="mt-8"
          />
        </section>
      </main>
      <Footer />
    </>
  );
}
