import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Newsreader, Share_Tech } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });
const newsreader = Newsreader({ subsets: ["latin"], weight: ["400"], variable: "--font-newsreader" });
const shareTech = Share_Tech({ subsets: ["latin"], weight: "400", variable: "--font-share-tech" });

export const metadata: Metadata = {
  title: "Vouch — admission & evidence",
  description: "The merchant-side layer that lets AI buyers pay, and proves they were inside their authority.",
};

// `dark` is fixed, not toggled: the palette in globals.css has no light half to switch to.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark ${inter.variable} ${jetbrains.variable} ${newsreader.variable} ${shareTech.variable}`}
    >
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
