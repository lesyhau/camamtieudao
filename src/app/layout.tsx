import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Cảm Âm Tiêu Dao",
  description: "Đọc bản nhạc số (giản phổ) từ ảnh và chuyển sang cảm âm cho sáo, tiêu.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
