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
          <Converter />

          {/* Below `rail` there is no margin to put an ad in, so it goes into the flow - after
              the work, before the footer, which is on the way out of the page rather than
              across it. Above `rail` the margins take over and this disappears, so a wide
              screen never has an ad inside the content column at all. */}
          <AdSlot
            client={ads.client}
            slot={ads.slots.bottom}
            shape="banner"
            contact={ads.contact}
            className="mt-8 rail:hidden"
          />
        </section>
      </main>
      <Footer />

      {/* The margins, on screens wide enough to have them. Fixed and vertically centred, so
          they stay put while the page scrolls and never enter the reading column. Hidden
          entirely below 1408px - see the `rail` screen in tailwind.config.ts - because a
          skyscraper squeezed into a narrow margin is worse than no skyscraper.
          z-30 keeps them under the header (z-50) rather than sliding over it. */}
      <div className="hidden rail:block" aria-hidden={false}>
        <div className="fixed left-4 top-1/2 -translate-y-1/2 z-30">
          <AdSlot client={ads.client} slot={ads.slots.railLeft} shape="rail" contact={ads.contact} />
        </div>
        <div className="fixed right-4 top-1/2 -translate-y-1/2 z-30">
          <AdSlot client={ads.client} slot={ads.slots.railRight} shape="rail" contact={ads.contact} />
        </div>
      </div>
    </>
  );
}
