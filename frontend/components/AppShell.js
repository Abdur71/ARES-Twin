"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BookOpen, FlaskConical, Gauge, Orbit, Radio, SlidersHorizontal, Sparkles, Sun, Target, Users,
} from "lucide-react";
import { MissionProvider, useMission } from "@/lib/mission";

const NAV = [
  { href: "/", label: "Mission", icon: Gauge },
  { href: "/crew/rahman", match: "/crew", label: "Crew twin", icon: Users },
  { href: "/whatif", label: "What-if", icon: SlidersHorizontal },
  { href: "/optimize", label: "Optimizer", icon: Target },
  { href: "/spaceweather", label: "Space weather", icon: Sun },
  { href: "/twin-lab", label: "Twin lab", icon: FlaskConical },
  { href: "/about", label: "About the model", icon: BookOpen },
];

function MissionClock() {
  const { day, setDay, mission, error } = useMission();
  const [draft, setDraft] = useState(null); // non-null only while the slider is being dragged
  const shown = draft ?? day ?? 0;
  const commit = () => {
    if (draft != null) setDay(draft);
    setDraft(null);
  };

  const sources = mission?.sources || {};
  const live = Object.values(sources).filter((s) => s === "live" || s === "cache").length;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[11px] text-slate-300">
      <label className="flex items-center gap-2">
        <span className="text-slate-400">MISSION DAY</span>
        <input
          type="range" min={0} max={mission?.mission_days ?? 270} value={shown}
          onChange={(e) => setDraft(Number(e.target.value))}
          onPointerUp={commit} onKeyUp={commit} onBlur={commit}
          className="w-32 accent-cyan-500 sm:w-44" aria-label="Mission day"
        />
        <span className="w-16 tabular-nums text-cyan-300">{shown} / {mission?.mission_days ?? 270}</span>
      </label>
      {mission && (
        <>
          <span><span className="text-slate-400">DATE </span>{mission.current_date}</span>
          <span title="One-way light-time delay to Earth"><Radio className="mr-1 inline h-3 w-3 text-cyan-400" aria-hidden />
            <span className="text-slate-400">COMM DELAY </span>{mission.comm_delay_min.toFixed(1)} min</span>
          <span><span className="text-slate-400">SUN </span>{mission.r_au.toFixed(2)} AU</span>
          <span title={Object.entries(sources).map(([k, v]) => `${k}: ${v}`).join("\n")}>
            <span className="text-slate-400">DATA </span>
            <span className={live === 4 ? "text-emerald-300" : "text-amber-300"}>{live}/4 sources</span>
            {mission.offline_mode && <span className="text-amber-300"> · offline</span>}
          </span>
        </>
      )}
      {error && <span className="text-rose-300">Backend offline</span>}
    </div>
  );
}

function Nav() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="-mx-1 flex gap-1 overflow-x-auto pb-1">
      {NAV.map(({ href, match, label, icon: Icon }) => {
        const active = match ? path.startsWith(match) : path === href;
        return (
          <Link
            key={href} href={href}
            className={`flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors ${
              active ? "bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-500/30" : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function AppShell({ children }) {
  return (
    <MissionProvider>
      <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-1 flex-col px-4 sm:px-6 lg:px-8">
        <header className="sticky top-0 z-20 -mx-4 min-w-0 border-b border-cyan-900/30 bg-[#050814]/85 px-4 pt-3 pb-2 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-950/60 text-cyan-400">
                <Orbit className="h-4 w-4 animate-spin-slow" aria-hidden />
              </span>
              <span>
                <span className="block text-sm font-bold tracking-tight text-white">ARES Twin</span>
                <span className="block font-mono text-[10px] uppercase tracking-widest text-cyan-400/80">Mars transit digital twin</span>
              </span>
            </Link>
            <MissionClock />
          </div>
          <div className="mt-2 min-w-0"><Nav /></div>
        </header>
        <main className="min-w-0 flex-1 py-6">{children}</main>
        <footer className="flex flex-col gap-2 border-t border-cyan-900/30 py-5 font-mono text-[11px] text-slate-500 sm:flex-row sm:justify-between">
          <span>ARES Twin v0.2 · research &amp; decision-support prototype · not a medical device</span>
          <span><Sparkles className="mr-1 inline h-3 w-3" aria-hidden />Space weather: NASA CCMC DONKI · NOAA SWPC · JPL Horizons</span>
        </footer>
      </div>
    </MissionProvider>
  );
}
