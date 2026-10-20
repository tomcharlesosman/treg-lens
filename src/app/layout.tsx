import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
// Vendored Latin WOFF2 files keep fresh builds independent of Google Fonts.
// License and exact upstream hashes: ./fonts/README.md and provenance.json.
const sans = localFont({
  src: "./fonts/dm-sans-latin-variable.woff2",
  variable: "--font-sans",
  weight: "100 1000",
  style: "normal",
  display: "swap",
});
const display = localFont({
  src: "./fonts/inter-tight-latin-variable.woff2",
  variable: "--font-display",
  weight: "100 900",
  style: "normal",
  display: "swap",
});
// Treg's pixel display face, used for marketing headlines and readouts.
const pixel = localFont({
  src: "./fonts/geist-pixel-latin-400.woff2",
  variable: "--font-pixel",
  weight: "400",
  style: "normal",
  display: "swap",
});
const mono = localFont({
  src: [
    { path: "./fonts/ibm-plex-mono-latin-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-mono-latin-500.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-mono",
  display: "swap",
});
export const metadata: Metadata = {
  title: "Treg Lens — Be the brand AI recommends",
  description:
    "Your open-source workspace for AI visibility. Track answers, understand citations, and find your next opportunity with Treg.",
  icons: { icon: "/treg.svg" },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${display.variable} ${pixel.variable} ${mono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
