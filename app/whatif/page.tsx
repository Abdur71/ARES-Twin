"use client";
import { Suspense, useDeferredValue, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMission } from "@/lib/mission";
import { CREW, basePlan, getCrew, pct, radiation, simulate, statusColor, type Gcr, type Plan, type Scale } from "@/lib/engine";
import { BandChart, Card, Slider, StatusPill } from "@/components/ui";
import CrewPicker from "@/components/CrewPicker";

const SCALES: Scale[] = ["S1", "S2", "S3", "S4", "S5"];

function WhatIf() {
  const { day } = useMission();
  const qs = useSearchParams().get("crew");
  const [crewId, setCrewId] = useState(getCrew(qs ?? "") ? (qs as string) : CREW[2].id);
  const c = getCrew(crewId)!;
  const [s, setS] = useState({ resDays: 7, cardio: 60, sleep: c.sleep, adh: Math.round(c.adherence * 100), injury: false, injLen: 14, storm: false, scale: "S3" as Scale, shelter: false, offset: 10, gcr: "design" as Gcr });
  const set = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) => setS((p) => ({ ...p, [k]: v }));
  const pick = (id: string) => { const n = getCrew(id)!; setCrewId(id); setS((p) => ({ ...p, sleep: n.sleep, adh: Math.round(n.adherence * 100) })); };
  const reset = () => setS((p) => ({ ...p, resDays: 7, cardio: 60, sleep: c.sleep, adh: Math.round(c.adherence * 100), injury: false, storm: false, gcr: "design" }));

  const plan: Plan = useMemo(() => ({
    resDays: s.resDays, cardioMin: s.cardio, sleep: s.sleep, adherence: s.adh / 100,
    injury: s.injury ? { start: day, end: Math.min(269, day + s.injLen - 1) } : null,
    storm: s.storm ? { day: Math.min(269, day + s.offset), scale: s.scale, sheltered: s.shelter } : null,
    gcr: s.gcr,
  }), [s, day]);
  const dplan = useDeferredValue(plan);

  const base = useMemo(() => ({ sim: simulate(c, day, { ...basePlan(c), gcr: dplan.gcr }, { series: true }), rad: radiation(c, day, dplan.gcr, null) }), [c, day, dplan.gcr]);
  const scen = useMemo(() => ({ sim: simulate(c, day, dplan, { series: true }), rad: radiation(c, day, dplan.gcr, dplan.storm) }), [c, day, dplan]);
  const A = base.sim.arrival, B = scen.sim.arrival;
  const dR = B.readiness[1] - A.readiness[1];
  const stale = dplan !== plan;

  const rows: { label: string; a: string; b: string; d: number; good: 1 | -1; unit: string }[] = [
    { label: "Hip bone density loss", a: pct(A.bone[1]), b: pct(B.bone[1]), d: (B.bone[1] - A.bone[1]) * 100, good: -1, unit: " pts" },
    { label: "Leg muscle volume loss", a: pct(A.muscle[1]), b: pct(B.muscle[1]), d: (B.muscle[1] - A.muscle[1]) * 100, good: -1, unit: " pts" },
    { label: "Aerobic fitness loss", a: pct(A.vo2[1]), b: pct(B.vo2[1]), d: (B.vo2[1] - A.vo2[1]) * 100, good: -1, unit: " pts" },
    { label: "Dose on arrival", a: `${base.rad.atArrival.toFixed(0)} mSv`, b: `${scen.rad.atArrival.toFixed(0)} mSv`, d: scen.rad.atArrival - base.rad.atArrival, good: -1, unit: " mSv" },
    { label: "Chance of Ready", a: `${(A.pGreen * 100).toFixed(0)}%`, b: `${(B.pGreen * 100).toFixed(0)}%`, d: (B.pGreen - A.pGreen) * 100, good: 1, unit: " pts" },
  ];
  const tone = (d: number, g: 1 | -1) => (Math.abs(d) < 0.05 ? "#8c919e" : d * g > 0 ? statusColor.GREEN : statusColor.RED);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h1 className="text-3xl font-extrabold sm:text-4xl">What-if simulator</h1>
        <p className="max-w-2xl text-muted">Change the plan for the rest of the transit and compare it with nothing changing. Both runs share the same random draws, so differences come from your changes.</p>
        <CrewPicker value={crewId} onChange={pick} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
        <Card className="space-y-5 lg:sticky lg:top-40 lg:self-start">
          <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Plan from day {day}</h2><button onClick={reset} className="text-sm font-semibold text-accent">Reset</button></div>
          <Slider label="Resistance days per week" value={s.resDays} min={0} max={7} onChange={(v) => set("resDays", v)} />
          <Slider label="Cardio per day" value={s.cardio} min={0} max={60} step={5} unit=" min" onChange={(v) => set("cardio", v)} />
          <Slider label="Sleep" value={s.sleep} min={4} max={9} step={0.5} unit=" h" hint="Under 6 hours raises muscle loss by 20%." onChange={(v) => set("sleep", v)} />
          <Slider label="Adherence" value={s.adh} min={0} max={100} step={5} unit="%" onChange={(v) => set("adh", v)} />

          <div className="border-t border-line pt-5">
            <label className="flex items-center justify-between gap-3 text-sm font-bold"><span>Injury, no resistance work</span><input type="checkbox" className="h-5 w-5 accent-[#ff4a2b]" checked={s.injury} onChange={(e) => set("injury", e.target.checked)} /></label>
            {s.injury && <div className="mt-3"><Slider label="Duration" value={s.injLen} min={1} max={60} unit=" days" onChange={(v) => set("injLen", v)} /></div>}
          </div>
          <div className="border-t border-line pt-5">
            <label className="flex items-center justify-between gap-3 text-sm font-bold"><span>Add a solar storm</span><input type="checkbox" className="h-5 w-5 accent-[#ff4a2b]" checked={s.storm} onChange={(e) => set("storm", e.target.checked)} /></label>
            {s.storm && (
              <div className="mt-3 space-y-3">
                <div className="flex gap-2" role="group" aria-label="Storm scale">
                  {SCALES.map((k) => (<button key={k} onClick={() => set("scale", k)} aria-pressed={s.scale === k} className={`pill h-10 flex-1 text-sm font-bold ${s.scale === k ? "!border-accent bg-accent/15" : "text-muted"}`}>{k}</button>))}
                </div>
                <Slider label="Strikes in" value={s.offset} min={1} max={90} unit=" days" onChange={(v) => set("offset", v)} />
                <label className="flex items-center justify-between gap-3 text-sm font-semibold"><span>Crew reaches the shelter</span><input type="checkbox" className="h-5 w-5 accent-[#ff4a2b]" checked={s.shelter} onChange={(e) => set("shelter", e.target.checked)} /></label>
              </div>
            )}
          </div>
          <div className="border-t border-line pt-5">
            <div className="mb-2 text-sm font-bold">Cosmic ray scenario</div>
            <div className="pill flex p-1 text-sm font-semibold" role="group">
              {(["design", "measured"] as const).map((g) => (<button key={g} onClick={() => set("gcr", g)} aria-pressed={s.gcr === g} className={`flex-1 rounded-full py-2 ${s.gcr === g ? "bg-accent text-white" : "text-muted"}`}>{g === "design" ? "Design goal" : "Measured"}</button>))}
            </div>
          </div>
        </Card>

        <div className={`space-y-6 transition-opacity ${stale ? "opacity-70" : ""}`}>
          <div className="grid gap-4 sm:grid-cols-2">
            {([["Nothing changes", A], ["Your scenario", B]] as const).map(([t, r], i) => (
              <Card key={t} className={i ? "!border-accent/50" : ""}>
                <div className="flex items-center justify-between gap-2"><span className="text-sm font-bold text-muted">{t}</span><StatusPill status={r.status} /></div>
                <div className="mt-3 flex items-end gap-3">
                  <span className="num display text-6xl font-extrabold leading-none" style={{ color: statusColor[r.status] }}>{r.readiness[1].toFixed(0)}</span>
                  <span className="pb-1 text-sm text-muted">readiness on arrival</span>
                </div>
                <div className="num mt-2 text-xs text-muted">P5 {r.readiness[0].toFixed(0)} to P95 {r.readiness[2].toFixed(0)}{i === 1 && <span className="ml-2 font-bold" style={{ color: tone(dR, 1) }}>{dR >= 0 ? "+" : ""}{dR.toFixed(1)} vs baseline</span>}</div>
              </Card>
            ))}
          </div>
          <Card>
            <h2 className="mb-2 font-bold">Readiness forecast</h2>
            <BandChart label="Scenario readiness" ks={scen.sim.series!.k} bands={scen.sim.series!.readiness} compare={base.sim.series!.readiness} today={day} color="#ff4a2b" yMin={0} yMax={100} />
          </Card>
          <Card>
            <h2 className="mb-3 font-bold">Before and after</h2>
            <div className="scroll-x">
              <table className="num w-full min-w-[420px] text-sm">
                <thead><tr className="text-left text-xs text-muted"><th className="pb-2 font-semibold">Measure</th><th className="pb-2 font-semibold">Nothing changes</th><th className="pb-2 font-semibold">Scenario</th><th className="pb-2 text-right font-semibold">Change</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.label} className="border-t border-line"><td className="py-3 font-semibold">{r.label}</td><td className="py-3 text-muted">{r.a}</td><td className="py-3 font-bold">{r.b}</td>
                      <td className="py-3 text-right font-bold" style={{ color: tone(r.d, r.good) }}>{r.d >= 0 ? "+" : ""}{r.d.toFixed(1)}{r.unit}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function Page() { return <Suspense fallback={null}><WhatIf /></Suspense>; }
