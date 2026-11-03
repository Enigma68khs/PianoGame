import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PianoGame — Play the classics with 4 keys",
  description: "A four-lane piano rhythm game where every key you press plays a real piano note — right or wrong.",
};

export const viewport: Viewport = { themeColor: "#07070f", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
