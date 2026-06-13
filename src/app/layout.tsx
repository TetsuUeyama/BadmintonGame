import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Badminton Game",
  description: "Next.js + TypeScript + Babylon.js で作るバドミントンゲーム",
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
