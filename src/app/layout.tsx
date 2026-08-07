import type { ReactNode } from "react";
import { ThemeProvider, MODE_INIT_SCRIPT } from "@/components/providers/ThemeProvider";
import { SiteBackground } from "@/components/ui/SiteBackground";
import "./globals.css";

// No webfont at all - the type is Arial, declared in tailwind.config.ts. Both of Proxyma's
// faces are gone: Orbitron because Google publishes it `latin`-only and it cannot spell
// "Cảm âm Tiêu Dao", Space Grotesk because Arial replaces it. Nothing is downloaded, so there
// is no font swap and text renders in its final face on the first frame.

export const metadata = {
  title: "Cảm âm Tiêu Dao",
  description: "Cảm âm nhạc Hoa chất lượng cao. Đọc giản phổ (简谱) từ ảnh và dịch sang cảm âm cho sáo, tiêu.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // data-mode is stamped by the inline script below before first paint; the "dark" here is
  // only the pre-script fallback for a browser with JS disabled, matching the :root defaults.
  return (
    <html lang="vi" data-mode="dark" suppressHydrationWarning>
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
