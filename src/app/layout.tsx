import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import { ThemeProvider, MODE_INIT_SCRIPT } from "@/components/providers/ThemeProvider";
import { SiteBackground } from "@/components/ui/SiteBackground";
import { adsConfig } from "@/lib/ads.ts";
import "./globals.css";

// Inter, replacing Arial.
//
// Arial cost nothing to load but is a poor reading face at the sizes this page actually uses.
// Almost everything here is 12px and 14px, and Arial's closed apertures and narrow spacing are
// hardest to read exactly there. Inter was drawn for screen UI at small sizes - taller x-height,
// open apertures - and it carries the `vietnamese` subset, which is the constraint that ruled
// out Orbitron for the wordmark and Lato and Figtree for this.
//
// One variable file covers every weight, self-hosted by next/font, so there is no request to
// Google at run time and no second file for bold.
const inter = Inter({
  subsets: ["latin", "vietnamese"],
  variable: "--font-ui",
  display: "swap",
});

export const metadata = {
  title: "Cảm âm Tiêu Dao",
  description: "Cảm âm nhạc Hoa chất lượng cao. Đọc giản phổ (简谱) từ ảnh và dịch sang cảm âm cho sáo, tiêu.",
  // The tab icon follows the SYSTEM colour scheme, not the site's own toggle - a favicon sits
  // in browser chrome, and browser chrome is painted by the OS preference, so matching the OS
  // is what makes it disappear into the tab strip.
  //
  // Declared here rather than as src/app/icon.png because a file-based icon is one file with no
  // way to express a mode. Both are listed so a browser that ignores `media` still gets an icon.
  icons: {
    icon: [
      { url: "/icon-light.png", media: "(prefers-color-scheme: light)", type: "image/png" },
      { url: "/icon-dark.png", media: "(prefers-color-scheme: dark)", type: "image/png" },
    ],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const ads = adsConfig();

  // data-mode is stamped by the inline script below before first paint; the "dark" here is
  // only the pre-script fallback for a browser with JS disabled, matching the :root defaults.
  return (
    <html lang="vi" data-mode="dark" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: MODE_INIT_SCRIPT }} />
        {/* The AdSense library, and only once there is a publisher id to load it for. Until
            then not a single byte goes to Google, and the ad positions render their own
            "advertise here" card instead - see src/lib/ads.ts. */}
        {ads.client && (
          <script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ads.client)}`}
            crossOrigin="anonymous"
          />
        )}
      </head>
      <body>
        <SiteBackground />
        {/* min-h-dvh flex column: the shell is always at least a screen tall, so the footer's
            mt-auto has slack to push against and the footer reaches the bottom edge even when
            the page is short. dvh rather than vh so a mobile browser's collapsing URL bar does
            not leave a strip of canvas below it. */}
        <ThemeProvider>
          <div className="min-h-dvh flex flex-col">{children}</div>
        </ThemeProvider>
      </body>
    </html>
  );
}
