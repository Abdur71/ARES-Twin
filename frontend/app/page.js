"use client";

import Link from "next/link";
import { ArrowRight, Orbit, Radio, ShieldCheck, Sun, Users } from "lucide-react";
import { RadiationMeter } from "@/components/charts";
import { ErrorBox, Loading, Panel, SimulatedNote, Stat, StatusPill, Card, Metric } from "@/components/ui";
import { HeroScene, TransitScene } from "@/components/Scene3D";
import { useApi } from "@/lib/api";
import { useMission } from "@/lib/mission";
import { METRICS, SERIES } from "@/lib/theme";
import { missionInfo, fmtDate } from "@/lib/engine";

function LossBar({ metric, loss }) {
  const m = METRICS[metric];
  const pct = loss * 100;
  return (
    <div>
      <div className="flex justify-between text-[11px] text-slate-400">
        <span>{m?.short || metric} loss</span>
        <span className="font-mono tabular-nums text-slate-200">{pct.toFixed(1)}% <span className="text-slate-500">/ {m?.limit || 20}%</span></span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-slate-800">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (pct / (m?.limit || 20)) * 100)}%`, background: SERIES.blue }} />
      </div>
    </div>
  );
}

function CrewCard({ card }) {
  const { profile, arrival, radiation, alerts } = card;
  const r = arrival.readiness;
  const serious = alerts.filter((a) => a.level !== "info").length;
  return (
    <article className="technical-panel flex flex-col gap-4 rounded-xl p-4 transition-transform duration-300 hover:-translate-y-1">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-slate-100">{profile.name}</h3>
          <p className="text-xs text-slate-400">{profile.role} · age {profile.age}</p>
        </div>
        <StatusPill status={arrival.status} />
      </header>
      <div>
        <div className="font-mono text-[11px] uppercase tracking-wider text-slate-400">Arrival readiness</div>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold tabular-nums text-white">{r.p50.toFixed(0)}</span>
          <span className="font-mono text-xs text-slate-400">P5–P95 {r.p5.toFixed(0)}–{r.p95.toFixed(0)}</span>
        </div>
      </div>
      <div className="space-y-2">
        {["bone", "muscle", "cardio"].map((k) => <LossBar key={k} metric={k} loss={arrival.loss[k].p50} />)}
      </div>
      <div>
        <div className="mb-1 flex justify-between text-[11px] text-slate-400">
          <span>Career dose</span>
          <span className="font-mono text-slate-200">{radiation.used_msv.toFixed(0)} → {radiation.arrival_msv.toFixed(0)} / 600 mSv</span>
        </div>
        <RadiationMeter budget={radiation} compact />
      </div>
      <footer className="mt-auto flex items-center justify-between border-t border-slate-800/80 pt-3 text-xs">
        <span className={serious ? "text-amber-300" : "text-slate-400"}>{serious} alert{serious === 1 ? "" : "s"}</span>
        <Link href={`/crew/${profile.id}`} className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200 font-medium">
          Open twin <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </footer>
    </article>
  );
}

export default function MissionDashboard() {
  const { day, mission, error: missionError, reload: reloadMission } = useMission();
  const currentDay = day ?? 0;
  const info = missionInfo(currentDay);
  const crew = useApi(day == null ? null : `/crew?day=${day}`);
  const sw = useApi("/spaceweather");
  const cards = crew.data?.crew || [];
  const green = cards.filter((c) => c.arrival.status === "GREEN").length;
  const events = (sw.data?.events || []).filter((e) => e.s_level >= 1);
  const upcoming = events.filter((e) => e.day >= currentDay).slice(0, 3);
  const recent = events.filter((e) => e.day < currentDay).slice(-3).reverse();

  return (
    <div className="space-y-8">
      {/* 3D Hero Section */}
      <section className="card relative overflow-hidden border border-cyan-500/20 bg-gradient-to-b from-[#0a101f] to-[#050814]">
        <div className="grid items-stretch lg:grid-cols-[1.05fr_1fr]">
          <div className="relative z-10 flex flex-col justify-center gap-6 p-6 sm:p-10 lg:py-14">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-950/40 px-3.5 py-1 text-xs font-semibold text-cyan-300 w-fit">
              <Orbit className="h-3.5 w-3.5 animate-spin-slow" />
              <span>Mars Transit Digital Twin</span>
            </div>
            <h1 className="rise text-4xl font-extrabold leading-[1.08] sm:text-5xl xl:text-6xl text-white">
              Arrive on Mars<br />
              <span className="bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400 bg-clip-text text-transparent">fit for duty</span>
            </h1>
            <p className="rise rise-2 max-w-lg text-base leading-relaxed text-slate-300 sm:text-lg">
              Every crew member gets a virtual body forecasting bone, muscle, heart fitness and radiation dose on Mars arrival day, then guides countermeasure interventions today.
            </p>
            <div className="rise rise-3 flex flex-wrap gap-3">
              <a href="#crew" className="btn">Open crew twins</a>
              <Link href="/whatif" className="btn btn-quiet">Try a what-if</Link>
              <Link href="/optimize" className="btn btn-quiet">Optimizer</Link>
            </div>
            <dl className="rise rise-3 grid max-w-lg grid-cols-2 gap-4 pt-3 sm:grid-cols-4">
              <Metric label="Mission day" value={currentDay} sub="of 270" />
              <Metric label="Comm delay" value={mission ? `${mission.comm_delay_min.toFixed(1)}m` : `${info.delayMin.toFixed(1)}m`} sub="one way" />
              <Metric label="Days to Mars" value={info.remaining} sub="days left" />
              <Metric label="Crew ready" value={cards.length ? `${green} / ${cards.length}` : "—"} sub="predicted" tone="#10b981" />
            </dl>
          </div>
          <div className="relative h-[340px] sm:h-[460px] lg:h-auto lg:min-h-[540px]">
            <HeroScene />
          </div>
        </div>
      </section>

      {/* 3D Transit Simulator */}
      <Card className="!p-0 overflow-hidden border border-cyan-500/20">
        <div className="flex flex-wrap items-end justify-between gap-3 p-5 sm:p-6 bg-slate-950/40">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <Orbit className="h-6 w-6 text-cyan-400" />
              Transit simulator
            </h2>
            <p className="mt-1 max-w-2xl text-xs sm:text-sm text-slate-400">
              Drag to orbit, scroll or pinch to zoom. The Ares spacecraft flies the Hohmann transfer orbit synchronized with the mission clock slider above.
            </p>
          </div>
          <div className="pill px-3.5 py-1.5 font-mono text-xs font-semibold text-cyan-300">
            {fmtDate(currentDay)} · Day {currentDay}
          </div>
        </div>
        <div className="h-[360px] border-y border-cyan-900/40 bg-black/40 sm:h-[480px] lg:h-[560px]">
          <TransitScene day={currentDay} />
        </div>
        <div className="grid grid-cols-2 gap-5 p-5 sm:grid-cols-4 sm:p-6 bg-slate-950/40">
          <Metric label="Distance from Sun" value={`${info.rSun.toFixed(2)} AU`} />
          <Metric label="Distance from Earth" value={`${info.earthDist.toFixed(2)} AU`} />
          <Metric label="One-way signal delay" value={`${info.delayMin.toFixed(1)} min`} />
          <Metric label="Days to Mars" value={`${info.remaining} d`} />
        </div>
      </Card>

      <ErrorBox error={missionError || crew.error || sw.error}
        onRetry={() => { reloadMission(); crew.reload(); sw.reload(); }} />

      {/* Crew status cards */}
      <section id="crew" className="scroll-mt-24 space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <Users className="h-6 w-6 text-cyan-400" />
              Crew status
            </h2>
            <p className="text-xs sm:text-sm text-slate-400">
              Arrival-day forecast if current habits continue. Bars show median loss against system threshold limits.
            </p>
          </div>
          <SimulatedNote />
        </div>
        {crew.loading && !cards.length ? <Loading /> : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((c) => <CrewCard key={c.profile.id} card={c} />)}
          </div>
        )}
      </section>

      {/* Space Weather & Context */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Space weather" icon={Sun} subtitle="Real NOAA solar proton events de-duplicated against NASA DONKI."
          actions={<Link href="/spaceweather" className="text-xs text-cyan-300 hover:text-cyan-200">Full timeline →</Link>}>
          {sw.loading && !sw.data ? <Loading label="Loading space weather…" /> : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[["Recent", recent], ["Upcoming", upcoming]].map(([label, list]) => (
                <div key={label}>
                  <h3 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-slate-400">{label}</h3>
                  {list.length ? (
                    <ul className="space-y-1.5 text-xs">
                      {list.map((e) => (
                        <li key={e.id} className="flex justify-between gap-2 rounded border border-slate-800 bg-slate-900/40 px-2 py-1.5">
                          <span className="text-slate-300">Day {e.day} · {e.date}</span>
                          <span className="font-mono text-slate-200">{e.s_scale} · {e.peak_pfu} pfu</span>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-xs text-slate-500">None in this window</p>}
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Panel title="Why it matters" icon={ShieldCheck}>
          <ul className="space-y-2 text-sm text-slate-300">
            <li className="flex gap-2">
              <Radio className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" aria-hidden />
              <span>Up to <strong>{mission ? Math.max(14, mission.comm_delay_min).toFixed(0) : "22"} minutes</strong> one way to Earth: critical countermeasures must be selected and monitored on board.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-cyan-400">•</span>
              <span>Bone mineral density declines 1–1.5% per month; muscle volume and aerobic capacity degrade 10–15% even under nominal workouts.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-cyan-400">•</span>
              <span>The twin provides <strong className="text-white">arrival forecasts</strong>, <Link href="/whatif" className="text-cyan-300 underline-offset-2 hover:underline">what-if scenario branch testing</Link>, and the <Link href="/optimize" className="text-cyan-300 underline-offset-2 hover:underline">minimal countermeasure workout plan</Link> to stay fit for duty.</span>
            </li>
          </ul>
          <p className="mt-3 font-mono text-[11px] text-slate-500">Crew cards show medians; full uncertainty bounds (P5–P95) and rotatable 3D twins are on each crew page.</p>
        </Panel>
      </div>
    </div>
  );
}
