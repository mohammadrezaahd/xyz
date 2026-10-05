import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "XYZ — Tether Exchange Comparison", description: "Compare Tether/Toman candles across Bitpin and Wallex." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }