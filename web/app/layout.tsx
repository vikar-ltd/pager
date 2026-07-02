import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Mono, IBM_Plex_Sans, Instrument_Serif } from "next/font/google";
import { PWARegister } from "@/components/pwa-register";
import "./globals.css";

// A distinctive humanist serif for numbers, titles, and moments that want
// to feel written rather than displayed.
const serif = Instrument_Serif({
  weight: ["400"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

// Warm, honest sans with tabular figures baked in — pairs beautifully with
// Instrument Serif without stealing focus.
const sans = IBM_Plex_Sans({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

// Mono kept in the same family so IDs, snippets, and patterns feel like they
// belong to the paper, not the terminal.
const mono = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Pager",
  description: "Self-hosted web visit tracker",
  manifest: "/manifest.webmanifest",
  applicationName: "Pager",
  appleWebApp: {
    capable: true,
    title: "Pager",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#231D19",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`h-full ${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body className="h-full antialiased font-sans">
        {children}
        <PWARegister />
      </body>
    </html>
  );
}
