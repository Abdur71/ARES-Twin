import type { Metadata, Viewport } from "next";
import { Syne, Manrope } from "next/font/google";
import "./globals.css";
import { MissionProvider } from "@/lib/mission";
import AppShell from "@/components/AppShell";

const syne = Syne({ subsets: ["latin"], variable: "--font-syne", weight: ["500", "600", "700", "800"], display: "swap" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });

export const metadata: Metadata = {
  title: "ARES Twin | Astronaut digital twin for Mars missions",
  description: "Forecast bone, muscle, heart fitness and radiation dose for every crew member on Mars arrival day.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0b0c10" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${syne.variable} ${manrope.variable}`}>
      <body>
        <MissionProvider>
          <AppShell>{children}</AppShell>
        </MissionProvider>
      </body>
    </html>
  );
}
