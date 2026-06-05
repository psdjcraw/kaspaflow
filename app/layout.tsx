import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "KaspaFlow",
  description: "Kaspa-only direct payments for small merchants",
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
