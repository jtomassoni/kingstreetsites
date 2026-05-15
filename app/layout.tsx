import type { Metadata } from "next";
import { DM_Sans, Instrument_Serif } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap"
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument",
  display: "swap"
});

export const metadata: Metadata = {
  title: "King Street Sites — Ecommerce & restaurant websites that convert",
  description:
    "High-conversion ecommerce stores and restaurant websites — optimized online ordering, private dining lead capture, checkout UX, and mobile-first design. Denver & Baltimore.",
  openGraph: {
    title: "King Street Sites",
    description:
      "Ecommerce conversion specialists and restaurant web design — ordering, private dining, and local brands that need results.",
    type: "website"
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${instrumentSerif.variable}`}>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
