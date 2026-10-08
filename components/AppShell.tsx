"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useMission } from "@/lib/mission";
import { MISSION_DAYS, fmtDate, missionInfo } from "@/lib/engine";
import { useBackend } from "@/lib/api";
import { IconBook, IconMission, IconSun, IconTarget, IconWhatIf, Logo } from "./icons";

const NAV = [
  { href: "/", label: "Mission", Icon: IconMission },
  { href: "/whatif", label: "What-if", Icon: IconWhatIf },
  { href: "/optimize", label: "Optimizer", Icon: IconTarget },
  { href: "/spaceweather", label: "Space weather", Icon: IconSun },
  { href: "/about", label: "Model", Icon: IconBook },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { day, setDay } = useMission();
  const backend = useBackend();
  const info = missionInfo(day);
  const active = (h: string) => (h === "/" ? path === "/" || path.startsWith("/crew") : path.startsWith(h));
  const fill = `${(day / MISSION_DAYS) * 100}%`;

  const clock = (
    <div className="flex items-center gap-3 w-full">
      <div className="num shrink-0 text-sm leading-tight">
        <div className="font-bold">Day {day}<span className="text-muted font-medium"> / {MISSION_DAYS}</span></div>
        <div className="text-muted text-xs">{fmtDate(day)}</div>
      </div>
      <input aria-label="Mission day" type="range" min={0} max={MISSION_DAYS} value={day} style={{ ["--fill" as string]: fill }} onChange={(e) => setDay(+e.target.value)} className="min-w-0 flex-1" />
      <div className="num hidden shrink-0 text-right text-xs leading-tight sm:block">
        <div className="font-bold">{info.delayMin.toFixed(1)} min</div>
        <div className="text-muted">one-way delay</div>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh pb-28 lg:pb-12">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5" aria-label="ARES Twin home">
            <Logo />
            <span className="display text-lg font-bold">ARES Twin</span>
          </Link>
          <nav className="pill ml-2 hidden items-center gap-1 p-1 lg:flex" aria-label="Primary">
            {NAV.map(({ href, label }) => (
              <Link key={href} href={href} className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${active(href) ? "bg-accent text-white" : "text-muted hover:text-ink"}`}>{label}</Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 text-xs font-semibold lg:order-last">
            <span className="pill inline-flex items-center gap-2 px-3 py-1.5">
              <span className={`h-2 w-2 rounded-full ${backend === "live" ? "bg-go" : backend === "checking" ? "bg-muted" : "bg-warn"}`} />
              {backend === "live" ? "Live API" : backend === "checking" ? "Connecting" : "Demo engine"}
            </span>
          </div>
          <div className="order-last w-full lg:order-none lg:w-auto lg:min-w-[26rem] lg:flex-1 lg:max-w-xl">{clock}</div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 sm:pt-8">{children}</main>

      <footer className="mx-auto mt-14 max-w-7xl px-4 text-xs leading-relaxed text-muted sm:px-6">
        Simulation, research and decision-support prototype. Not a certified medical device. All astronaut profiles are simulated.
      </footer>

      <nav aria-label="Primary" className="safe-bottom pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 lg:hidden">
        <div className="pointer-events-auto flex w-full max-w-md items-center justify-between rounded-full border border-line bg-surface/90 p-1.5 shadow-2xl shadow-black/60 backdrop-blur-xl">
          {NAV.map(({ href, label, Icon }) => (
            <Link key={href} href={href} aria-label={label} aria-current={active(href) ? "page" : undefined}
              className={`flex h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-bold transition-colors ${active(href) ? "bg-accent text-white" : "text-muted"}`}>
              <Icon width={20} height={20} />
              <span>{label === "Space weather" ? "Weather" : label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
