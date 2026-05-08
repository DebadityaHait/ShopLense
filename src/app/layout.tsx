import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShopLense",
  description: "Compare quick-commerce prices, availability, and alerts across local marketplaces.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
