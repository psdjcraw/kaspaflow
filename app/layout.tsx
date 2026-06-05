import type { Metadata, Viewport } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "KaspaFlow",
  description: "Kaspa-only direct payments for small merchants",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#167761",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
