
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import {
  BookOpen,
  FlaskConical,
  Gauge,
  Orbit,
  Radio,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Target,
  Users,
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

/* Mission Clock */

function MissionClock() {
  const { day, setDay, mission, error } = useMission();
  const [draft, setDraft] = useState(null);

  const shown = draft ?? day ?? 0;

  const commit = () => {
    if (draft != null) setDay(draft);
    setDraft(null);
  };

  const sources = mission?.sources || {};

  const live = Object.values(sources).filter(
    (s) => s === "live" || s === "cache"
  ).length;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[11px] text-muted">

      <label className="flex items-center gap-2">
        <span className="whitespace-nowrap text-muted">MISSION DAY</span>

        <input
          type="range"
          min={0}
          max={mission?.mission_days ?? 270}
          value={shown}
          onChange={(e) => setDraft(Number(e.target.value))}
          onPointerUp={commit}
          onKeyUp={commit}
          onBlur={commit}
          className="w-24 accent-accent sm:w-36 lg:w-44"
          aria-label="Mission day"
        />

        <span className="w-16 whitespace-nowrap tabular-nums text-accent">
          {shown} / {mission?.mission_days ?? 270}
        </span>
      </label>

      {mission && (
        <>
          <span className="whitespace-nowrap">
            <span className="text-muted">DATE </span>
            {mission.current_date}
          </span>

          <span
            className="whitespace-nowrap"
            title="One-way light-time delay to Earth"
          >
            <Radio className="mr-1 inline h-3 w-3 text-accent" aria-hidden />
            <span className="text-muted">COMM DELAY </span>
            {mission.comm_delay_min.toFixed(1)} min
          </span>

          <span className="whitespace-nowrap">
            <span className="text-muted">SUN </span>
            {mission.r_au.toFixed(2)} AU
          </span>

          <span className="whitespace-nowrap">
            <span className="text-muted">DATA </span>
            <span className={live === 4 ? "text-go" : "text-warn"}>
              {live}/4 sources
            </span>
            {mission.offline_mode && (
              <span className="text-warn"> · offline</span>
            )}
          </span>
        </>
      )}

      {error && <span className="text-stop">Backend offline</span>}
    </div>
  );
}

/* Top Navigation */

function Nav() {
  const path = usePathname();

  return (
    <nav
      aria-label="Main navigation"
      className="w-full"
    >
      <div
        className="
          relative w-full
          overflow-x-auto overflow-y-visible
          overscroll-x-contain
          scroll-smooth
          [-webkit-overflow-scrolling:touch]
          [scrollbar-width:none]
          [&::-webkit-scrollbar]:hidden
        "
      >
        <div className="flex min-w-[620px] items-end justify-between gap-1 px-1 pt-5 sm:min-w-0 sm:gap-2">

          {NAV.map(({ href, match, label, icon: Icon }) => {
            const active = match
              ? path.startsWith(match)
              : path === href;

            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`
                  group relative flex min-w-0 flex-1
                  flex-col items-center justify-end
                  rounded-t-xl px-1 pb-3
                  transition-colors duration-300
                  ${active
                    ? "bg-surface/70"
                    : "hover:bg-surface/40"
                  }
                `}
              >

                {/* Active floating icon */}

                <span
                  className={`
                    relative -mt-5 mb-1
                    flex items-center justify-center
                    transition-all duration-300 ease-out
                    ${active ? "-translate-y-1" : "translate-y-0"}
                  `}
                >
                  <span
                    className={`
                      flex shrink-0 items-center justify-center
                      rounded-full transition-all duration-300
                      ${active
                        ? "h-12 w-12 border-[4px] border-[#0b0c10] bg-accent text-white shadow-[0_0_22px_rgba(255,74,43,0.28)] sm:h-[54px] sm:w-[54px]"
                        : "h-9 w-9 bg-transparent text-muted group-hover:bg-surface-2 group-hover:text-accent"
                      }
                    `}
                  >
                    <Icon
                      className={`
                        transition-all duration-300
                        ${active ? "h-5 w-5 sm:h-6 sm:w-6" : "h-[19px] w-[19px]"}
                      `}
                      strokeWidth={active ? 2.3 : 1.7}
                      aria-hidden
                    />
                  </span>
                </span>

                {/* Navigation label */}

                <span
                  className={`
                    max-w-full truncate text-center
                    transition-all duration-300
                    ${active
                      ? "text-[11px] font-bold text-accent sm:text-sm"
                      : "text-[10px] font-medium text-muted group-hover:text-ink sm:text-xs"
                    }
                  `}
                >
                  {label}
                </span>

                {/* Active indicator */}

                <span
                  className={`
                    absolute bottom-0 h-[2px] rounded-full
                    bg-accent transition-all duration-300
                    ${active ? "w-8 opacity-100" : "w-0 opacity-0"}
                  `}
                />

              </Link>
            );
          })}

        </div>
      </div>
    </nav>
  );
}

/* Application Shell */

export default function AppShell({ children }) {
  return (
    <MissionProvider>
      <div className="mx-auto flex min-h-screen w-full min-w-0 max-w-7xl flex-1 flex-col px-4 sm:px-6 lg:px-8">

        {/* Sticky Header */}

        <header
          className="
            sticky top-0 z-40
            -mx-4 min-w-0
            border-b border-line
            bg-[#0b0c10]/95
            px-4 pt-3
            backdrop-blur-xl
            sm:-mx-6 sm:px-6
            lg:-mx-8 lg:px-8
          "
        >

          {/* Branding and Mission Clock */}

          <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 pb-3">

            {/* Branding */}

            <Link
              href="/"
              className="flex shrink-0 items-center gap-2.5"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent/30 bg-accent/15 text-accent">
                <Orbit className="h-5 w-5 animate-spin-slow" aria-hidden />
              </span>

              <span>
                <span className="font-nasa block text-sm font-bold tracking-tight text-white">
                  ARES Twin
                </span>

                <span className="block font-mono text-[10px] uppercase tracking-widest text-accent/80">
                  Mars transit digital twin
                </span>
              </span>
            </Link>

            {/* Mission Clock */}

            <div className="min-w-0 max-w-full">
              <MissionClock />
            </div>

          </div>

          {/* Full-width Top Navigation */}

          <div className="border-t border-line/70">
            <Nav />
          </div>

        </header>

        {/* Main Page Content */}

        <main className="min-w-0 flex-1 py-6">
          {children}
        </main>

        {/* Footer */}

        <footer className="flex flex-col gap-2 border-t border-line py-5 font-mono text-[11px] text-muted sm:flex-row sm:justify-between">
          <span>
            ARES Twin v0.2 · research &amp; decision-support prototype · not a medical device
          </span>

          <span>
            <Sparkles className="mr-1 inline h-3 w-3" aria-hidden />
            Space weather: NASA CCMC DONKI · NOAA SWPC · JPL Horizons
          </span>
        </footer>

      </div>
    </MissionProvider>
  );
}
