import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "明王招福護摩供 参加報告",
  description: "伝道会別の参加報告、全体集計、帳票出力を管理します。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
