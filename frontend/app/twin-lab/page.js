"use client";

import { useEffect, useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Dices, EyeOff, FlaskConical } from "lucide-react";
import { ErrorBox, Loading, Panel, Stat } from "@/components/ui";
import { api } from "@/lib/api";
import { CHART, CREW_TABS, SERIES } from "@/lib/theme";

const Z90 = 1.645;
const PARAMS = {
  bone: { title: "Hip bone loss rate (%/month)", scale: 100, digits: 2 },
  muscle: { title: "Muscle loss multiplier", scale: 1, digits: 2 },
  cardio: { title: "Cardio decline multiplier", scale: 1, digits: 2 },
};

function ConvergenceChart({ title, rows, truth, step, digits, height = 200 }) {
  const f = (v) => Number(v).toFixed(digits);
  return (
    <figure>
      <figcaption className="mb-1 text-xs font-medium text-slate-300">{title}</figcaption>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 14, left: -12 }}>
            <CartesianGrid stroke={CHART.grid} vertical={false} />
            <XAxis dataKey="k" type="number" domain={[0, rows.length - 1]} allowDecimals={false} stroke={CHART.axis}
              tick={{ fill: CHART.tick, fontSize: 11 }} tickLine={false}
              label={{ value: "check-ups seen", position: "insideBottomRight", offset: -2, fill: CHART.tick, fontSize: 10 }} />
            <YAxis stroke={CHART.axis} tick={{ fill: CHART.tick, fontSize: 11 }} tickLine={false} width={48} domain={["auto", "auto"]} tickFormatter={f} />
            <Tooltip cursor={{ stroke: "#475569" }} content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const r = payload[0].payload;
              return (
                <div className="rounded-md border border-slate-700 bg-slate-950/95 px-3 py-2 text-[11px] text-slate-200">
                  <div className="font-mono text-slate-400">{r.k} check-ups (day {r.day})</div>
                  <div>Twin: {f(r.mean)} · 90% band {f(r.band[0])} – {f(r.band[1])}</div>
                  {truth != null && <div>Hidden truth: {f(truth)}</div>}
                </div>
              );
            }} />
            {truth != null && (
              <ReferenceLine y={truth} stroke="#e2e8f0" strokeWidth={1}
                label={{ value: "hidden truth", position: "insideTopRight", fill: "#e2e8f0", fontSize: 10 }} />
            )}
            <ReferenceLine x={step} stroke="#64748b" />
            <Area dataKey="band" stroke="none" fill={SERIES.blue} fillOpacity={0.2} isAnimationActive={false} />
            <Line dataKey="mean" stroke={SERIES.blue} strokeWidth={2} dot={{ r: 3, fill: SERIES.blue, stroke: CHART.surface, strokeWidth: 2 }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export default function TwinLabPage() {
  const [crewId, setCrewId] = useState("rahman");
  const [seed, setSeed] = useState(7);
  const [interval, setIntervalDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [step, setStep] = useState(0);
  const [reveal, setReveal] = useState(false);

  useEffect(() => {
    let alive = true;
    api("/twin/experiment", { method: "POST", body: { crew_id: crewId, seed, interval } })
      .then((d) => { if (alive) { setData(d); setError(null); setStep(d.steps.length - 1); setReveal(false); } })
      .catch((e) => alive && setError(e));
    return () => { alive = false; };
  }, [crewId, seed, interval]);

  const series = useMemo(() => {
    if (!data) return null;
    return Object.fromEntries(Object.entries(PARAMS).map(([k, p]) => [k, data.steps.map((s) => {
      const m = s.posterior[k].mean * p.scale;
      const sd = s.posterior[k].sd * p.scale;
      return { k: s.checkups, day: s.day, mean: m, band: [m - Z90 * sd, m + Z90 * sd] };
    })]));
  }, [data]);

  const readinessRows = useMemo(() => data?.steps.map((s) => ({
    k: s.checkups, day: s.day, mean: s.arrival.readiness.p50, band: [s.arrival.readiness.p5, s.arrival.readiness.p95],
  })), [data]);

  const current = data?.steps[step];
  const first = data?.steps[0];

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-3xl font-bold tracking-tight text-white">Twin lab — hidden-truth experiment</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          Real astronaut medical data isn&apos;t public, so we prove the method instead: a secret astronaut is drawn with hidden personal rates,
          noisy check-ups are generated from them (DXA ±1.5%, muscle ±3%, VO2 ±4%), and the twin — starting from the population average —
          updates after each check-up. Watch its estimate close in on the truth.
        </p>
      </section>

      <Panel title="Experiment" icon={FlaskConical}>
        <div className="flex flex-wrap items-end gap-4 text-xs">
          <label className="text-slate-400">Behaviour record from
            <select value={crewId} onChange={(e) => setCrewId(e.target.value)} className="mt-1 block rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100">
              {CREW_TABS.map((c) => <option key={c.id} value={c.id}>{c.name}&apos;s logs</option>)}
            </select>
          </label>
          <label className="text-slate-400">Check-up every
            <select value={interval} onChange={(e) => setIntervalDays(Number(e.target.value))} className="mt-1 block rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100">
              {[14, 30, 60].map((d) => <option key={d} value={d}>{d} days</option>)}
            </select>
          </label>
          <button onClick={() => setSeed(Math.floor(Math.random() * 10000))}
            className="inline-flex items-center gap-1.5 rounded-md border border-cyan-500/40 bg-cyan-500/15 px-3 py-1.5 font-medium text-cyan-200 hover:bg-cyan-500/25">
            <Dices className="h-3.5 w-3.5" aria-hidden /> New hidden astronaut
          </button>
          <span className="font-mono text-slate-500">seed {seed}</span>
          {data && (
            <label className="min-w-[220px] flex-1 text-slate-300">
              <span className="flex justify-between"><span>Check-ups seen</span><span className="font-mono text-cyan-300">{step} / {data.steps.length - 1}</span></span>
              <input type="range" min={0} max={data.steps.length - 1} value={step} onChange={(e) => setStep(Number(e.target.value))} className="mt-1 w-full accent-cyan-500" />
            </label>
          )}
        </div>
      </Panel>

      <ErrorBox error={error} />
      {!data ? <Loading label="Drawing a hidden astronaut…" /> : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Arrival readiness (twin)" value={current.arrival.readiness.p50.toFixed(0)} hint={`90% band ${current.arrival.readiness.p5.toFixed(0)}–${current.arrival.readiness.p95.toFixed(0)}`} />
            <Stat label="Band width" value={`${(current.arrival.readiness.p95 - current.arrival.readiness.p5).toFixed(0)} pts`} hint={`was ${(first.arrival.readiness.p95 - first.arrival.readiness.p5).toFixed(0)} with no check-ups`} />
            <Stat label="Bone rate (twin)" value={`${(current.posterior.bone.mean * 100).toFixed(2)} %/mo`} hint={`± ${(current.posterior.bone.sd * 100).toFixed(2)}`} />
            <button onClick={() => setReveal((r) => !r)} className="rounded-lg border border-slate-700 bg-slate-900/40 p-3 text-left hover:border-cyan-500/40">
              <div className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-slate-400"><EyeOff className="h-3 w-3" aria-hidden /> Hidden truth</div>
              <div className="mt-0.5 text-lg font-semibold text-slate-100">{reveal ? data.true_arrival.readiness.p50.toFixed(0) : "Reveal"}</div>
              <div className="text-[11px] text-slate-400">{reveal ? `bone ${(data.truth.bone * 100).toFixed(2)} %/mo · muscle ${data.truth.muscle.toFixed(2)}× · cardio ${data.truth.cardio.toFixed(2)}×` : "true arrival readiness"}</div>
            </button>
          </div>

          <Panel title="Convergence" subtitle={`Twin estimate (blue, 90% credible band) after each check-up.${reveal ? " White line: the hidden truth." : " Reveal the hidden truth to compare."}`}>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <ConvergenceChart title="Arrival readiness forecast (P5–P95)" rows={readinessRows} truth={reveal ? data.true_arrival.readiness.p50 : null} step={step} digits={0} />
              {Object.entries(PARAMS).map(([k, p]) => (
                <ConvergenceChart key={k} title={p.title} rows={series[k]} truth={reveal ? data.truth[k] * p.scale : null} step={step} digits={p.digits} />
              ))}
            </div>
          </Panel>

          <Panel title="Is the twin honest?" subtitle={`Measured over ${data.calibration.astronauts} hidden astronauts with this behaviour record and check-up interval.`}>
            <p className="text-sm text-slate-300">
              A 90% credible band should contain the truth about 90% of the time — no more (over-cautious) and no less (over-confident).
              Any single experiment can miss; the rate across many is what matters.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {Object.entries(data.calibration.coverage).map(([k, v]) => (
                <Stat key={k} label={`${k} coverage`} value={`${Math.round(v * 100)}%`} hint="target 90%" />
              ))}
            </div>
          </Panel>

          <Panel title="Check-up measurements" subtitle="Relative to baseline (1.00 = pre-flight)">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left font-mono text-xs">
                <thead className="text-[11px] text-slate-400">
                  <tr><th className="py-1 font-normal">Day</th><th className="font-normal">Bone measured</th><th className="font-normal">Muscle measured</th><th className="font-normal">VO2 measured</th></tr>
                </thead>
                <tbody className="text-slate-200">
                  {data.checkup_days.map((d, i) => {
                    const at = (m) => data.measurements.find((x) => x.day === d && x.metric === m);
                    return (
                      <tr key={d} className={`border-t border-slate-800 ${i >= step ? "text-slate-500" : ""}`}>
                        <td className="py-1.5">{d}</td>
                        {["bone", "muscle", "cardio"].map((m) => <td key={m}>{at(m).rel_value.toFixed(3)}{reveal && <span className="text-slate-500"> (true {at(m).true_value.toFixed(3)})</span>}</td>)}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
