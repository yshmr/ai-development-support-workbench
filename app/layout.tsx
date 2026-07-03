import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LLM App PoC MVP",
  description: "要件メモから仕様・受け入れ条件・Jiraタスクを生成するPoC"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
