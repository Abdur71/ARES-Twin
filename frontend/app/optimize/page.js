"use client";

import { useState } from "react";
import { Check, Play, Target } from "lucide-react";
import { ErrorBox, Loading, Panel, SimulatedNote, Stat, Toggle } from "@/components/ui";
import { api } from "@/lib/api";
import { useMission } from "@/lib/mission";
import { CREW_TABS } from "@/lib/theme";

// Sequential single-hue ramp (blue) for the dark surface: low probability recedes, high is bright.
const RAMP = ["#13213a", "#104281", "#184f95", "#1c5cab", "#256abf", "#2a78d6", "#3987e5", "#5598e7", "#6da7ec", "#86b6ef"];
const rampColor = (p) => RAMP[Math.min(RAMP.length - 1, Math.floor(p * RAMP.length))];

function Heatmap({ result }) {
  const [hover, setHover] = useState(null);
  const res = [...new Set(result.grid.map((g) => g.resistance_days))].sort((a, b) => b - a);
  const cardio = [...new Set(result.grid.map((g) => g.cardio_min))].sort((a, b) => a - b);
  const cell = (r, c) => result.grid.find((g) => g.resistance_days === r && g.cardio_min === c);
  const best = result.best;
  const shown = hover || best || result.closest;
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="border-separate" style={{ borderSpacing: 2 }}>
          <caption className="mb-2 text-left text-xs text-slate-300">
            Share of Monte Carlo runs reaching readiness ≥ {result.goal.readiness} at arrival
          </caption>
          <thead>
            <tr>
              <th className="pr-2 text-right font-mono text-[10px] font-normal text-slate-500">days/wk ↓ · cardio →</th>
              {cardio.map((c) => <th key={c} className="w-12 font-mono text-[10px] font-normal text-slate-400">{c}m</th>)}
            </tr>
          </thead>
          <tbody>
            {res.map((r) => (
              <tr key={r}>
                <th className="pr-2 text-right font-mono text-[10px] font-normal text-slate-400">{r}</th>
                {cardio.map((c) => {
                  const g = cell(r, c);
                  const isBest = best && g.resistance_days === best.resistance_days && g.cardio_min === best.cardio_min;
                  return (
                    <td key={c}
                      onMouseEnter={() => setHover(g)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(g)} onBlur={() => setHover(null)}
                      tabIndex={0}
                      aria-label={`${r} resistance days, ${c} min cardio: ${(g.probability * 100).toFixed(0)}% of runs${g.meets_goal ? ", meets goal" : ""}`}
                      className={`h-9 w-12 rounded text-center align-middle font-mono text-[10px] outline-none focus:ring-2 focus:ring-cyan-300 ${isBest ? "ring-2 ring-white" : ""}`}
                      style={{ background: rampColor(g.probability), color: g.probability > 0.55 ? "#0b1222" : "#cbd5e1" }}
                    >
                      {g.meets_goal ? <Check className="mx-auto h-3.5 w-3.5" aria-hidden /> : `${Math.round(g.probability * 100)}`}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 font-mono text-[10px] text-slate-400">
        <span>0%</span>
        <span className="flex">{RAMP.map((c) => <span key={c} className="h-2.5 w-5" style={{ background: c }} />)}</span>
        <span>100%</span>
        <span className="flex items-center gap-1"><Check className="h-3 w-3" aria-hidden /> meets goal ({Math.round(result.goal.probability * 100)}% of runs)</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded ring-2 ring-white" /> cheapest passing plan</span>
      </div>
      {shown && (
        <p className="mt-3 rounded border border-slate-800 bg-slate-900/50 px-3 py-2 font-mono text-[11px] text-slate-300">
          {shown.resistance_days} resistance days + {shown.cardio_min} min cardio · {(shown.weekly_minutes / 60).toFixed(1)} h/week ·
          readiness P10 {shown.readiness_p10.toFixed(0)} / median {shown.readiness_p50.toFixed(0)} · {(shown.probability * 100).toFixed(0)}% of runs ≥ {result.goal.readiness}
        </p>
      )}
    </div>
  );
}

export default function OptimizePage() {
  const { day } = useMission();
  const [crewId, setCrewId] = useState("rahman");
  const [goal, setGoal] = useState(75);
  const [prob, setProb] = useState(0.9);
  const [adherence, setAdherence] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await api("/optimize", { method: "POST", body: { crew_id: crewId, day, goal_readiness: goal, goal_probability: prob, include_adherence: adherence } }));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-3xl font-bold tracking-tight text-white">Countermeasure optimizer</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Runs the simulator backwards: tries all 56 plans (0–7 resistance days × 0–60 min cardio) with 200 Monte Carlo runs each
          and returns the cheapest plan that keeps arrival readiness above your goal.
        </p>
        <SimulatedNote className="mt-1" />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Panel title="Goal" icon={Target} className="lg:col-span-4">
          <div className="space-y-4 text-xs">
            <label className="block text-slate-400">Crew member
              <select value={crewId} onChange={(e) => setCrewId(e.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100">
                {CREW_TABS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="block text-slate-300">
              <span className="flex justify-between"><span>Arrival readiness at least</span><span className="font-mono text-cyan-300">{goal}</span></span>
              <input type="range" min={50} max={90} value={goal} onChange={(e) => setGoal(Number(e.target.value))} className="mt-1 w-full accent-cyan-500" />
            </label>
            <label className="block text-slate-400">In this share of Monte Carlo runs
              <select value={prob} onChange={(e) => setProb(Number(e.target.value))} className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100">
                {[0.5, 0.75, 0.9, 0.95].map((p) => <option key={p} value={p}>{Math.round(p * 100)}%</option>)}
              </select>
            </label>
            <Toggle checked={adherence} onChange={setAdherence} label="Assume the astronaut's usual adherence (not 100%)" />
            <p className="text-slate-500">Plan starts on mission day {day ?? "…"}; the logged history before that is fixed. Move the mission clock to day 0 to plan the whole transit.</p>
            <button onClick={run} disabled={busy || day == null}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-cyan-500/40 bg-cyan-500/15 px-3 py-2 font-medium text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-50">
              <Play className="h-3.5 w-3.5" aria-hidden /> {busy ? "Searching 56 plans…" : "Optimize"}
            </button>
          </div>
        </Panel>
        <div className="space-y-6 lg:col-span-8">
          <ErrorBox error={error} />
          {busy && !result && <Panel><Loading label="Simulating 11,200 missions…" /></Panel>}
          {result && (
            <>
              <Panel className={busy ? "opacity-70" : ""}>
                <p className={`text-base font-medium ${result.best ? "text-emerald-200" : "text-amber-200"}`}>{result.message}</p>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat label="Plan" value={result.best ? `${result.best.resistance_days}d + ${result.best.cardio_min}m` : "—"} hint="resistance days + cardio/day" />
                  <Stat label="Exercise time" value={result.best ? `${(result.best.weekly_minutes / 60).toFixed(1)} h/wk` : "—"} hint={`default ${(result.default_weekly_minutes / 60).toFixed(0)} h/wk`} />
                  <Stat label="Readiness P10" value={(result.best || result.closest).readiness_p10.toFixed(0)} hint="1-in-10 worst case" />
                  <Stat label="Runs ≥ goal" value={`${Math.round((result.best || result.closest).probability * 100)}%`} hint={`${result.runs_per_plan} runs per plan`} />
                </div>
              </Panel>
              <Panel title="All 56 plans" className={busy ? "opacity-70" : ""}>
                <Heatmap result={result} />
              </Panel>
            </>
          )}
          {!result && !busy && <Panel><p className="py-8 text-center text-sm text-slate-400">Set a goal and press Optimize.</p></Panel>}
        </div>
      </div>
    </div>
  );
}
