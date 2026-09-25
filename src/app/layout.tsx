import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Poppins, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const display = Poppins({
  subsets: ["latin"],
  weight: ["600"],
  variable: "--font-display-face",
  display: "swap",
});

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans-face",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CleanOps",
  description: "Commercial cleaning operations workspace prototype.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
