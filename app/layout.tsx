import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "智能答题挑战",
  description: "上传 PDF，开始智能答题",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
