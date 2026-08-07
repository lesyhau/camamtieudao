import type { ReactNode } from "react";
import { Space_Grotesk } from "next/font/google";
import { ThemeProvider, MODE_INIT_SCRIPT } from "@/components/providers/ThemeProvider";
import { SiteBackground } from "@/components/ui/SiteBackground";
import "./globals.css";

// Space Grotesk for everything, including the wordmark. Proxyma sets its wordmark in Orbitron,
// but Google publishes Orbitron with the `latin` subset ONLY - "Cảm âm Tiêu Dao" would lose
// every diacritic to a fallback face and render in two typefaces. Space Grotesk carries
// `vietnamese`, so it is the one that can spell the name. next/font self-hosts it: no request
// to Google at run time.
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin", "vietnamese"],
  variable: "--font-grotesk",
  display: "swap",
});

export const metadata = {
  title: "Cảm âm Tiêu Dao",
  description: "Cảm âm nhạc Hoa chất lượng cao. Đọc giản phổ (简谱) từ ảnh và dịch sang cảm âm cho sáo, tiêu.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // data-mode is stamped by the inline script below before first paint; the "dark" here is
  // only the pre-script fallback for a browser with JS disabled, matching the :root defaults.
  return (
    <html
      lang="vi"
      data-mode="dark"
      className={spaceGrotesk.variable}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: MODE_INIT_SCRIPT }} />
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
