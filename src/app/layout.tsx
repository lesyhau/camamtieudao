import type { ReactNode } from "react";
import { Space_Grotesk, Orbitron } from "next/font/google";
import { MODE_INIT_SCRIPT } from "@/components/theme.ts";
import "./globals.css";

// Proxyma's two faces: Space Grotesk for everything, Orbitron for the wordmark ONLY.
// next/font self-hosts both, so there is no request to Google at run time.
const grotesk = Space_Grotesk({ subsets: ["latin", "vietnamese"], variable: "--font-grotesk", display: "swap" });
const orbitron = Orbitron({ subsets: ["latin"], variable: "--font-orbitron", display: "swap" });

export const metadata = {
  title: "Cảm Âm Tiêu Dao",
  description: "Đọc bản nhạc số (giản phổ) từ ảnh và chuyển sang cảm âm cho sáo, tiêu.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // data-mode is stamped by the inline script below before first paint; the "dark" here is
  // only the pre-script fallback for a browser with JS disabled, matching the :root defaults.
  return (
    <html lang="vi" data-mode="dark" className={`${grotesk.variable} ${orbitron.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: MODE_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
