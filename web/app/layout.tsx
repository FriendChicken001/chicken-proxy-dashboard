import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "mitmproxy dashboard",
  description: "Live intercepted-traffic dashboard for mitmproxy",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
