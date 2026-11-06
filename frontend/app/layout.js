import "./globals.css";
import AppShell from "@/components/AppShell";
import { Unbounded, Manrope } from "next/font/google";
import localFont from "next/font/local";

const display = Unbounded({
  subsets: ["latin"],
  variable: "--font-display-face",
  weight: ["500", "600", "700", "800"],
  display: "swap",
});
const body = Manrope({
  subsets: ["latin"],
  variable: "--font-body-face",
  display: "swap",
});
const nasa = localFont({
  src: "./fonts/Nasalization Rg.otf",
  variable: "--font-nasa-face",
  display: "swap",
});

export const metadata = {
  title: "ARES Twin — Astronaut Digital Twin Simulator",
  description: "Mission Control Simulation & Decision-Support System for Deep-Space Mars Transit",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${nasa.variable} dark h-full bg-[#0b0c10] text-ink`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col font-sans selection:bg-accent/30 selection:text-accent" suppressHydrationWarning>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
