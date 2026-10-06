"use client";

import { useEffect, useState } from "react";
import { ArrowRight, SlidersHorizontal, Sparkles } from "lucide-react";
import { CompareChart } from "@/components/charts";
import { ErrorBox, Loading, Panel, SimulatedNote, StatusPill, Toggle } from "@/components/ui";
import { api } from "@/lib/api";
import { useMission } from "@/lib/mission";
import { CREW_TABS } from "@/lib/theme";

const STORM_SCALES = [
  { label: "S1 (~30 pfu)", pfu: 30 },
  { label: "S2 (~300 pfu)", pfu: 300 },
  { label: "S3 (~3,000 pfu)", pfu: 3000 },
  { label: "S4 (~20,000 pfu)", pfu: 20000 },
  { label: "S5 (~150,000 pfu)", pfu: 150000 },
];

function Slider({ label, value, min, max, step = 1, onChange, format = (v) => v }) {
  return (
    <label className="block text-xs text-slate-300">
      <span className="flex justify-between"><span>{label}</span><span className="font-mono text-cyan-300">{format(value)}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-cyan-500" />
    </label>
  );
}

export default function WhatIfPage() {
  const { day } = useMission();
  const [crewId, setCrewId] = useState("rahman");
  const [form, setForm] = useState(null);
  // start/day = null → follow the mission clock (today, and today + 30 for the storm)
  const [injuryState, setInjury] = useState({ on: false, start: null, days: 21 });
  const [stormState, setStorm] = useState({ on: false, day: null, pfu: 20000, sheltered: true });
  const today = day ?? 0;
  const injury = { ...injuryState, start: Math.max(injuryState.start ?? today, today) };
  const storm = { ...stormState, day: Math.min(269, Math.max(stormState.day ?? today + 30, today)) };
  const [gcr, setGcr] = useState("design_goal");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Slider defaults = the astronaut's current habits ("nothing changes")
  useEffect(() => {
    let alive = true;
    api(`/whatif/defaults/${crewId}`).then((d) => alive && setForm(d)).catch((e) => alive && setError(e));
    return () => { alive = false; };
  }, [crewId]);

  const bodyJson = form && day != null ? JSON.stringify({
    crew_id: crewId, day, gcr_scenario: gcr,
    resistance_days: form.resistance_days, cardio_min: form.cardio_min, sleep_h: form.sleep_h, adherence: form.adherence,
    ...(injury.on ? { injury_start: injury.start, injury_days: injury.days } : {}),
    ...(storm.on ? { storm: { day: storm.day, peak_pfu: storm.pfu, sheltered: storm.sheltered } } : {}),
  }) : null;

  // Debounced re-run whenever the scenario changes
  useEffect(() => {
    if (!bodyJson) return undefined;
    const t = setTimeout(() => {
      setBusy(true);
      api("/whatif", { method: "POST", body: JSON.parse(bodyJson) })
        .then((r) => { setResult(r); setError(null); })
        .catch(setError)
        .finally(() => setBusy(false));
    }, 300);
    return () => clearTimeout(t);
  }, [bodyJson]);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const a = result?.baseline;
  const b = result?.scenario;

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-3xl font-bold tracking-tight text-white">What-if simulator</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Change behaviour from mission day {day ?? "…"} onward and re-run the remaining mission. The blue line is
          &ldquo;nothing changes&rdquo;; orange is your scenario. Both use the same Monte Carlo draws.
        </p>
        <SimulatedNote className="mt-1" />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Panel title="Scenario" icon={SlidersHorizontal} className="lg:col-span-4">
          <label className="mb-4 block text-xs text-slate-400">Crew member
            <select value={crewId} onChange={(e) => { setForm(null); setCrewId(e.target.value); }}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100">
              {CREW_TABS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          {!form ? <Loading label="Loading habits…" /> : (
            <div className="space-y-4">
              <Slider label="Resistance exercise days / week" value={form.resistance_days} min={0} max={7} onChange={set("resistance_days")} />
              <Slider label="Cardio minutes / day" value={form.cardio_min} min={0} max={60} step={5} onChange={set("cardio_min")} format={(v) => `${v} min`} />
              <Slider label="Sleep hours / night" value={form.sleep_h} min={4} max={9} step={0.25} onChange={set("sleep_h")} format={(v) => `${v} h`} />
              <Slider label="Adherence to the plan" value={form.adherence} min={0} max={1} step={0.05} onChange={set("adherence")} format={(v) => `${Math.round(v * 100)}%`} />

              <div className="space-y-2 rounded-lg border border-slate-800 p-3">
                <Toggle checked={injury.on} onChange={(on) => setInjury({ ...injury, on })} label="Injury: no resistance exercise" />
                {injury.on && (
                  <>
                    <Slider label="Starts on mission day" value={injury.start} min={day ?? 0} max={269} onChange={(v) => setInjury({ ...injury, start: v })} />
                    <Slider label="Length" value={injury.days} min={7} max={60} onChange={(v) => setInjury({ ...injury, days: v })} format={(v) => `${v} days`} />
                  </>
                )}
              </div>

              <div className="space-y-2 rounded-lg border border-slate-800 p-3">
                <Toggle checked={storm.on} onChange={(on) => setStorm({ ...storm, on })} label="Add a solar particle event" />
                {storm.on && (
                  <>
                    <Slider label="Mission day" value={storm.day} min={day ?? 0} max={269} onChange={(v) => setStorm({ ...storm, day: v })} />
                    <label className="block text-xs text-slate-400">Size (NOAA S-scale)
                      <select value={storm.pfu} onChange={(e) => setStorm({ ...storm, pfu: Number(e.target.value) })}
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100">
                        {STORM_SCALES.map((s) => <option key={s.pfu} value={s.pfu}>{s.label}</option>)}
                      </select>
                    </label>
                    <Toggle checked={storm.sheltered} onChange={(sheltered) => setStorm({ ...storm, sheltered })} label="Crew reached the storm shelter" />
                  </>
                )}
              </div>

              <label className="block text-xs text-slate-400">Cosmic-ray dose rate
                <select value={gcr} onChange={(e) => setGcr(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100">
                  <option value="design_goal">NASA design goal · 1.3 mSv/day</option>
                  <option value="measured">Measured MSL/RAD · 1.84 mSv/day</option>
                </select>
              </label>
            </div>
          )}
        </Panel>

        <div className="space-y-6 lg:col-span-8">
          <ErrorBox error={error} />
          {!result ? <Panel><Loading /></Panel> : (
            <>
              <Panel title="Before → after" icon={Sparkles} className={busy ? "opacity-70" : ""}>
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <StatusPill status={a.arrival.status} size="lg" />
                  <ArrowRight className="h-4 w-4 text-slate-500" aria-hidden />
                  <StatusPill status={b.arrival.status} size="lg" />
                  <span className="font-mono text-sm text-slate-300">
                    readiness {a.arrival.readiness.p50.toFixed(0)} → <span className="text-white">{b.arrival.readiness.p50.toFixed(0)}</span>
                    <span className={result.delta.readiness < 0 ? " text-rose-300" : " text-emerald-300"}> ({result.delta.readiness >= 0 ? "+" : ""}{result.delta.readiness.toFixed(1)})</span>
                  </span>
                </div>
                <ul className="space-y-1 text-sm text-slate-300">
                  {result.summary.map((s) => <li key={s} className="font-mono text-xs">{s}</li>)}
                </ul>
              </Panel>
              <Panel title="Forecast comparison" subtitle="Medians of 500 runs each" className={busy ? "opacity-70" : ""}>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <CompareChart title="Readiness score" a={a.series.readiness.p50} b={b.series.readiness.p50} currentDay={day} unit="" digits={0}
                    yDomain={[(min) => Math.max(0, Math.floor(min / 10) * 10 - 10), 100]}
                    refLines={[{ y: 70, label: "GREEN ≥ 70" }, { y: 50, label: "AMBER ≥ 50" }]} />
                  <CompareChart title="Leg muscle loss" a={a.series.muscle.p50} b={b.series.muscle.p50} currentDay={day} />
                  <CompareChart title="Hip bone density loss" a={a.series.bone.p50} b={b.series.bone.p50} currentDay={day} />
                  <CompareChart title="VO2peak loss" a={a.series.cardio.p50} b={b.series.cardio.p50} currentDay={day} />
                  <CompareChart title="Career radiation dose (mSv)" a={a.series.dose} b={b.series.dose} currentDay={day} unit="" digits={0}
                    refLines={[{ y: 600, label: "Career limit 600" }]} />
                </div>
              </Panel>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
