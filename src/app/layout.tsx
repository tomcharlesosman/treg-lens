import type { Metadata } from "next";
import { DM_Sans, IBM_Plex_Mono, Inter_Tight } from "next/font/google";
import "./globals.css";
const sans = DM_Sans({ variable: "--font-sans", subsets: ["latin"] });
const display = Inter_Tight({ variable: "--font-display", subsets: ["latin"] });
const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
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
      className={`${sans.variable} ${display.variable} ${mono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
