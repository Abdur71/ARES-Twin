"use client";
import { Suspense, useDeferredValue, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMission } from "@/lib/mission";
import { CREW, getCrew, optimize, type PlanResult } from "@/lib/engine";
import { Card, Metric, Slider } from "@/components/ui";
import CrewPicker from "@/components/CrewPicker";

const CARDIO = [0, 10, 20, 30, 40, 50, 60];
const cellColor = (p: number) => `hsl(${Math.round(p * 135)} ${40 + p * 25}% ${16 + p * 14}%)`;

function Optimizer() {
  const { day } = useMission();
  const qs = useSearchParams().get("crew");
  const [crewId, setCrewId] = useState(getCrew(qs ?? "") ? (qs as string) : CREW[0].id);
  const [goal, setGoal] = useState(70);
  const [conf, setConf] = useState(90);
  const [usual, setUsual] = useState(false);
  const [sel, setSel] = useState<PlanResult | null>(null);
  const c = getCrew(crewId)!;
  const dp = useDeferredValue({ goal, conf, usual, crewId, day });
  const res = useMemo(() => optimize(getCrew(dp.crewId)!, dp.day, dp.goal, dp.conf / 100, dp.usual), [dp]);
  const shown = sel && res.plans.find((p) => p.resDays === sel.resDays && p.cardioMin === sel.cardioMin) || res.best;
  const grid = (rd: number, cm: number) => res.plans.find((p) => p.resDays === rd && p.cardioMin === cm)!;
  const isBest = (p: PlanResult) => p.resDays === res.best.resDays && p.cardioMin === res.best.cardioMin;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h1 className="text-3xl font-extrabold sm:text-4xl">Exercise optimizer</h1>
        <p className="max-w-2xl text-muted">Searches 56 plans (0 to 7 resistance days a week, 0 to 60 cardio minutes a day) from day {day} and returns the cheapest one that reaches your goal.</p>
        <CrewPicker value={crewId} onChange={(id) => { setCrewId(id); setSel(null); }} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
        <Card className="space-y-5 lg:sticky lg:top-40 lg:self-start">
          <h2 className="text-lg font-bold">Goal</h2>
          <Slider label="Arrival readiness at least" value={goal} min={50} max={95} onChange={setGoal} />
          <Slider label="In this share of runs" value={conf} min={50} max={99} unit="%" onChange={setConf} />
          <label className="flex items-center justify-between gap-3 text-sm font-semibold">
            <span>Use {c.name.split(" ")[1]}&apos;s usual adherence<span className="block text-xs font-normal text-muted">Otherwise plans are followed as prescribed.</span></span>
            <input type="checkbox" className="h-5 w-5 shrink-0 accent-[#ff4a2b]" checked={usual} onChange={(e) => setUsual(e.target.checked)} />
          </label>
        </Card>

        <div className="space-y-6">
          <Card className={res.met ? "!border-go/40" : "!border-warn/40"}>
            <div className="text-sm font-bold" style={{ color: res.met ? "#35d6a0" : "#ffb23e" }}>{res.met ? "Cheapest plan that meets the goal" : "No plan reaches the goal. Closest plan shown"}</div>
            <div className="display mt-2 text-2xl font-extrabold leading-tight sm:text-4xl">
              {res.best.resDays} resistance day{res.best.resDays === 1 ? "" : "s"} a week<br />+ {res.best.cardioMin} min cardio a day
            </div>
            <div className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-4">
              <Metric label="Weekly exercise" value={res.best.minutes} sub="minutes" />
              <Metric label="Chance of goal" value={`${(res.best.prob * 100).toFixed(0)}%`} />
              <Metric label="Median readiness" value={res.best.median.toFixed(0)} />
              <Metric label="Worst 10% below" value={res.best.p10.toFixed(0)} />
            </div>
            {!res.met && <p className="mt-4 text-sm text-muted">Later in the mission, or with low adherence, there may be too little time left to recover. Try a lower goal or confidence.</p>}
          </Card>

          <Card>
            <h2 className="font-bold">Every plan</h2>
            <p className="mb-4 mt-1 text-xs text-muted">Colour shows the chance of reaching readiness {goal}. Tap a cell for details.</p>
            <div className="grid grid-cols-[auto_repeat(7,minmax(0,1fr))] items-center gap-1 sm:gap-1.5">
              <div className="text-[10px] font-semibold leading-tight text-muted sm:text-xs">Resist. days<br />Cardio min</div>
              {CARDIO.map((m) => <div key={m} className="num text-center text-[10px] font-bold text-muted sm:text-xs">{m}</div>)}
              {Array.from({ length: 8 }, (_, rd) => (
                <div key={rd} className="contents">
                  <div className="num pr-1 text-center text-xs font-bold text-muted">{rd}</div>
                  {CARDIO.map((cm) => {
                    const p = grid(rd, cm), best = isBest(p), on = shown.resDays === rd && shown.cardioMin === cm;
                    return (
                      <button key={cm} onClick={() => setSel(p)} aria-label={`${rd} resistance days, ${cm} minutes cardio, ${(p.prob * 100).toFixed(0)} percent chance`} aria-pressed={on}
                        className="num grid aspect-[1.25] place-items-center rounded-md text-[10px] font-bold transition-transform hover:scale-105 sm:rounded-lg sm:text-xs"
                        style={{ background: cellColor(p.prob), boxShadow: best ? "0 0 0 2px #ff4a2b" : on ? "0 0 0 2px #f4f5f7" : "none" }}>
                        {(p.prob * 100).toFixed(0)}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="card-flat mt-5 flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <span className="font-bold">{shown.resDays} days a week + {shown.cardioMin} min cardio</span>
              <span className="num text-muted">{shown.minutes} min a week, {(shown.prob * 100).toFixed(0)}% chance, median {shown.median.toFixed(0)}</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
export default function Page() { return <Suspense fallback={null}><Optimizer /></Suspense>; }
