import "./globals.css";
import AppShell from "@/components/AppShell";

export const metadata = {
  title: "ARES Twin — Astronaut Digital Twin Simulator",
  description: "Mission Control Simulation & Decision-Support System for Deep-Space Mars Transit",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark h-full bg-[#050814] text-slate-100" suppressHydrationWarning>
      <body className="min-h-full flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200" suppressHydrationWarning>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
