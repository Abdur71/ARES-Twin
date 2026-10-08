"use client";
import Link from "next/link";
import { useMemo } from "react";
import { useMission } from "@/lib/mission";
import { CAREER_LIMIT, CREW, EVENTS, MISSION_DAYS, basePlan, eventDose, fmtDate, isSheltered, missionInfo, pct, radiation, simulate, statusColor } from "@/lib/engine";
import { Card, Gauge, Metric, StatusPill } from "@/components/ui";
import { HeroScene, TransitScene } from "@/components/Scene3D";
import { IconArrow } from "@/components/icons";

export default function MissionPage() {
  const { day } = useMission();
  const info = missionInfo(day);
  const crew = useMemo(
    () => CREW.map((c) => ({ c, r: simulate(c, day, basePlan(c)), rad: radiation(c, day, "design", null) })),
    [day],
  );
  const upcoming = EVENTS.filter((e) => e.day >= day).slice(0, 3);
  const recent = EVENTS.filter((e) => e.day < day).slice(-3).reverse();

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* hero */}
      <section className="card relative overflow-hidden">
        <div className="grid items-stretch lg:grid-cols-[1.05fr_1fr]">
          <div className="relative z-10 flex flex-col justify-center gap-6 p-6 sm:p-10 lg:py-16">
            <h1 className="rise text-4xl font-extrabold leading-[1.05] sm:text-5xl xl:text-6xl">
              Arrive on Mars<br /><span className="text-accent">fit for duty</span>
            </h1>
            <p className="rise rise-2 max-w-lg text-base leading-relaxed text-muted sm:text-lg">
              Every crew member gets a virtual body that forecasts bone, muscle, heart fitness and radiation dose for arrival day, then shows what to change today.
            </p>
            <div className="rise rise-3 flex flex-wrap gap-3">
              <a href="#crew" className="btn">Open crew twins</a>
              <Link href="/whatif" className="btn btn-quiet">Try a what-if</Link>
            </div>
            <dl className="rise rise-3 grid max-w-md grid-cols-3 gap-4 pt-2">
              <Metric label="Mission day" value={day} sub={`of ${MISSION_DAYS}`} />
              <Metric label="Signal delay" value={`${info.delayMin.toFixed(1)}m`} sub="one way" />
              <Metric label="Arrival in" value={info.remaining} sub="days" />
            </dl>
          </div>
          <div className="relative h-[340px] sm:h-[460px] lg:h-auto lg:min-h-[560px]"><HeroScene /></div>
        </div>
      </section>

      {/* transit */}
      <Card className="!p-0 overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 p-5 sm:p-6">
          <div>
            <h2 className="text-2xl font-bold">Transit simulator</h2>
            <p className="mt-1 max-w-xl text-sm text-muted">Drag to orbit, pinch or scroll to zoom. Move the mission clock above and the ship flies the transfer orbit to Mars.</p>
          </div>
          <div className="pill px-3 py-1.5 text-xs font-semibold">{fmtDate(day)}</div>
        </div>
        <div className="h-[360px] border-y border-line bg-black/30 sm:h-[480px] lg:h-[560px]"><TransitScene day={day} /></div>
        <div className="grid grid-cols-2 gap-5 p-5 sm:grid-cols-4 sm:p-6">
          <Metric label="Distance from Sun" value={`${info.rSun.toFixed(2)} AU`} />
          <Metric label="Distance from Earth" value={`${info.earthDist.toFixed(2)} AU`} />
          <Metric label="One-way signal delay" value={`${info.delayMin.toFixed(1)} min`} />
          <Metric label="Days to Mars" value={info.remaining} />
        </div>
      </Card>

      {/* crew */}
      <section id="crew" className="scroll-mt-40">
        <h2 className="mb-4 text-2xl font-bold">Crew twins</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {crew.map(({ c, r, rad }) => {
            const a = r.arrival, col = statusColor[a.status];
            const rows: [string, number, number][] = [["Hip bone", a.bone[1], a.subs.bone], ["Leg muscle", a.muscle[1], a.subs.muscle], ["Aerobic (VO2)", a.vo2[1], a.subs.cardio]];
            return (
              <Link key={c.id} href={`/crew/${c.id}`} className="card group flex flex-col gap-5 p-5 transition-transform duration-300 hover:-translate-y-1" aria-label={`${c.name}, ${a.status}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="display grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-bold" style={{ boxShadow: `0 0 0 2px ${col}` }}>{c.name.split(" ")[1].slice(0, 2)}</span>
                    <div className="min-w-0"><div className="truncate font-bold">{c.name}</div><div className="truncate text-xs text-muted">{c.role}</div></div>
                  </div>
                  <StatusPill status={a.status} />
                </div>
                <div className="flex items-center gap-4">
                  <Gauge value={a.readiness[1] / 100} display={a.readiness[1].toFixed(0)} color={col} size={96} />
                  <div className="min-w-0 flex-1 space-y-2.5">
                    {rows.map(([l, loss, s]) => (
                      <div key={l}>
                        <div className="flex justify-between text-xs"><span className="text-muted">{l}</span><span className="num font-bold">-{pct(loss)}</span></div>
                        <div className="mt-1 h-1.5 rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${Math.max(4, s * 100)}%`, background: s >= 0.7 ? statusColor.GREEN : s >= 0.4 ? statusColor.AMBER : statusColor.RED }} /></div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs"><span className="text-muted">Dose on arrival</span><span className="num font-bold">{rad.atArrival.toFixed(0)} / {CAREER_LIMIT} mSv</span></div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-white/10"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (rad.atArrival / CAREER_LIMIT) * 100)}%` }} /></div>
                </div>
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>{(a.pGreen * 100).toFixed(0)}% chance of Ready on arrival</span>
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-accent text-white transition-transform group-hover:translate-x-1"><IconArrow width={18} height={18} /></span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* events */}
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-2xl font-bold">Solar events</h2>
          <p className="text-xs text-muted">Sample events for the demo. Connect the backend for NASA DONKI and NOAA data.</p>
        </div>
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          {[["Upcoming", upcoming], ["Recent", recent]].map(([title, list]) => (
            <div key={title as string}>
              <h3 className="mb-2 text-sm font-bold text-muted">{title as string}</h3>
              {(list as typeof EVENTS).length === 0 && <p className="card-flat p-4 text-sm text-muted">{title === "Upcoming" ? "No further events in the replay window." : "No events yet. Move the mission clock forward."}</p>}
              <ul className="space-y-2">
                {(list as typeof EVENTS).map((e) => (
                  <li key={e.day} className="card-flat flex items-center gap-3 p-3.5">
                    <span className="display grid h-10 w-12 shrink-0 place-items-center rounded-xl bg-accent/15 text-sm font-bold text-accent">{e.scale}</span>
                    <div className="min-w-0 flex-1"><div className="text-sm font-bold">{fmtDate(e.day)}</div><div className="num text-xs text-muted">{e.flux} pfu peak, {isSheltered(e.scale) ? "crew sheltered" : "no shelter"}</div></div>
                    <div className="num text-right text-xs"><div className="font-bold">{eventDose(e).toFixed(2)} mSv</div><div className="text-muted">{e.day >= day ? `in ${e.day - day} d` : `${day - e.day} d ago`}</div></div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
