import type { ReactNode } from "react";

export const metadata = {
  title: "Cảm Âm Tiêu Dao",
  description: "Đọc bản nhạc số (giản phổ) từ ảnh và chuyển sang cảm âm.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
