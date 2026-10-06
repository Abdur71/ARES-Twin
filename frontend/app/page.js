"use client";

import Link from "next/link";
import { ArrowRight, Radio, ShieldCheck, Sun, Users } from "lucide-react";
import { RadiationMeter } from "@/components/charts";
import { ErrorBox, Loading, Panel, SimulatedNote, Stat, StatusPill } from "@/components/ui";
import { useApi } from "@/lib/api";
import { useMission } from "@/lib/mission";
import { METRICS, SERIES } from "@/lib/theme";

function LossBar({ metric, loss }) {
  const m = METRICS[metric];
  const pct = loss * 100;
  return (
    <div>
      <div className="flex justify-between text-[11px] text-slate-400">
        <span>{m.short} loss</span>
        <span className="font-mono tabular-nums text-slate-200">{pct.toFixed(1)}% <span className="text-slate-500">/ {m.limit}%</span></span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-slate-800">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (pct / m.limit) * 100)}%`, background: SERIES.blue }} />
      </div>
    </div>
  );
}

function CrewCard({ card }) {
  const { profile, arrival, radiation, alerts } = card;
  const r = arrival.readiness;
  const serious = alerts.filter((a) => a.level !== "info").length;
  return (
    <article className="technical-panel flex flex-col gap-4 rounded-xl p-4">
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
        <Link href={`/crew/${profile.id}`} className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200">
          Open twin <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </footer>
    </article>
  );
}

export default function MissionDashboard() {
  const { day, mission, error: missionError, reload: reloadMission } = useMission();
  const crew = useApi(day == null ? null : `/crew?day=${day}`);
  const sw = useApi("/spaceweather");
  const cards = crew.data?.crew || [];
  const green = cards.filter((c) => c.arrival.status === "GREEN").length;
  const events = (sw.data?.events || []).filter((e) => e.s_level >= 1);
  const upcoming = events.filter((e) => e.day >= (day ?? 0)).slice(0, 3);
  const recent = events.filter((e) => e.day < (day ?? 0)).slice(-3).reverse();

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Mission overview <span className="text-slate-500">· day {day ?? "…"}</span>
          </h1>
          <p className="max-w-2xl text-sm text-slate-400">
            Each crew member&apos;s virtual body forecasts bone, muscle, aerobic fitness and radiation dose on Mars arrival
            day — 500 Monte Carlo runs per astronaut, replaying the real solar weather of {mission?.mission_start ?? "2024"} onward.
          </p>
          <SimulatedNote />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:w-[560px]">
          <Stat label="Crew GREEN" value={cards.length ? `${green} / ${cards.length}` : "—"} hint="at arrival (median)" />
          <Stat label="Arrival" value={mission?.arrival_date ?? "—"} hint={`${270 - (day ?? 0)} days to go`} />
          <Stat label="Comm delay" value={mission ? `${mission.comm_delay_min.toFixed(1)} min` : "—"} hint="one-way to Earth" />
          <Stat label="Solar events" value={mission?.events_so_far ?? "—"} hint="≥ S1 so far" />
        </div>
      </section>

      <ErrorBox error={missionError || crew.error || sw.error}
        onRetry={() => { reloadMission(); crew.reload(); sw.reload(); }} />

      <Panel title="Crew status" icon={Users} subtitle="Arrival-day forecast if current habits continue. Bars show median loss against the limit where that system's score reaches zero.">
        {crew.loading && !cards.length ? <Loading /> : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((c) => <CrewCard key={c.profile.id} card={c} />)}
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Space weather" icon={Sun} subtitle="Real NOAA solar proton events, de-duplicated against NASA DONKI."
          actions={<Link href="/spaceweather" className="text-xs text-cyan-300 hover:text-cyan-200">Timeline →</Link>}>
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
                  ) : <p className="text-xs text-slate-500">None</p>}
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Panel title="Why it matters" icon={ShieldCheck}>
          <ul className="space-y-2 text-sm text-slate-300">
            <li className="flex gap-2"><Radio className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" aria-hidden />
              Up to {mission ? Math.max(14, mission.comm_delay_min).toFixed(0) : "22"} minutes one way to Earth: decisions have to be made on board.</li>
            <li>Bone loses 1–1.5% per month; muscle and aerobic fitness fall 10–15% even with exercise.</li>
            <li>The twin answers three questions: <strong className="text-slate-100">forecast</strong>, <Link href="/whatif" className="text-cyan-300 underline-offset-2 hover:underline">what-if</Link>, and the <Link href="/optimize" className="text-cyan-300 underline-offset-2 hover:underline">smallest exercise plan</Link> that keeps readiness above the line.</li>
          </ul>
          <p className="mt-3 font-mono text-[11px] text-slate-500">Crew cards show medians; uncertainty bands are on each crew twin page.</p>
        </Panel>
      </div>
    </div>
  );
}
