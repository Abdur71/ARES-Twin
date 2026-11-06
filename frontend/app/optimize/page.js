
"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Play, Target } from "lucide-react";

import {
  ErrorBox,
  Loading,
  SimulatedNote,
  Card,
  Metric,
  Toggle,
} from "@/components/ui";

import { api } from "@/lib/api";
import { useMission } from "@/lib/mission";
import { CREW_TABS } from "@/lib/theme";

const cellColor = (p) =>
  `rgba(255, 74, 43, ${0.08 + p * 0.42})`;

function Heatmap({ result }) {
  const [hover, setHover] = useState(null);

  const res = [
    ...new Set(result.grid.map((g) => g.resistance_days)),
  ].sort((a, b) => b - a);

  const cardio = [
    ...new Set(result.grid.map((g) => g.cardio_min)),
  ].sort((a, b) => a - b);

  const cell = (r, c) =>
    result.grid.find(
      (g) => g.resistance_days === r && g.cardio_min === c
    );

  const best = result.best;
  const shown = hover || best || result.closest;

  return (
    <div>
      <p className="mb-4 text-xs text-muted">
        Colour shows the share of Monte Carlo runs reaching readiness ≥{" "}
        {result.goal.readiness} at arrival. Select or hover over a cell
        to view its details.
      </p>

      {/* Heatmap */}
      <div className="grid grid-cols-[auto_repeat(7,minmax(0,1fr))] items-center gap-1 sm:gap-1.5">

        <div className="text-[10px] font-semibold leading-tight text-muted sm:text-xs">
          Resist. days
          <br />
          Cardio min
        </div>

        {cardio.map((c) => (
          <div
            key={c}
            className="num text-center text-[10px] font-bold text-muted sm:text-xs"
          >
            {c}
          </div>
        ))}

        {res.map((r) => (
          <div key={r} className="contents">
            <div className="num pr-1 text-center text-xs font-bold text-muted">
              {r}
            </div>

            {cardio.map((c) => {
              const g = cell(r, c);

              if (!g) return <div key={c} />;

              const isBest =
                best &&
                g.resistance_days === best.resistance_days &&
                g.cardio_min === best.cardio_min;

              const isSelected =
                shown &&
                shown.resistance_days === r &&
                shown.cardio_min === c;

              return (
                <button
                  key={c}
                  onClick={() => setHover(g)}
                  onMouseEnter={() => setHover(g)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(g)}
                  onBlur={() => setHover(null)}
                  aria-label={`${r} resistance days, ${c} min cardio: ${(g.probability * 100).toFixed(0)}% chance${g.meets_goal ? ", meets goal" : ""}`}
                  aria-pressed={!!isSelected}
                  className="num grid aspect-[1.25] place-items-center rounded-md text-[10px] font-bold outline-none transition-transform hover:scale-105 focus:ring-2 focus:ring-accent sm:rounded-lg sm:text-xs"
                  style={{
                    background: cellColor(g.probability),
                    color: "#f4f5f7",
                    boxShadow: isBest
                      ? "0 0 0 2px #ff4a2b"
                      : isSelected
                      ? "0 0 0 2px #f4f5f7"
                      : "none",
                  }}
                >
                  {g.meets_goal ? (
                    <Check
                      className="h-3.5 w-3.5"
                      aria-hidden
                    />
                  ) : (
                    Math.round(g.probability * 100)
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Heatmap legend */}
      <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-muted">
        <span>0%</span>

        <div className="flex overflow-hidden rounded-sm">
          {Array.from({ length: 10 }, (_, i) => {
            const p = i / 9;

            return (
              <span
                key={i}
                className="h-2.5 w-5"
                style={{ background: cellColor(p) }}
              />
            );
          })}
        </div>

        <span>100%</span>

        <span className="flex items-center gap-1">
          <Check className="h-3 w-3" />
          Meets goal
        </span>

        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded ring-2 ring-[#ff4a2b]" />
          Cheapest passing plan
        </span>
      </div>

      {/* Selected plan details */}
      {shown && (
        <div className="card-flat mt-5 flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
          <span className="font-bold">
            {shown.resistance_days} days/week + {shown.cardio_min} min cardio
          </span>

          <span className="num text-xs text-muted sm:text-sm">
            {(shown.weekly_minutes / 60).toFixed(1)} h/week ·{" "}
            {(shown.probability * 100).toFixed(0)}% chance · Median{" "}
            {shown.readiness_p50.toFixed(0)}
          </span>

          <div className="w-full border-t border-[var(--border)] pt-3 text-xs text-muted">
            Readiness P10:{" "}
            <span className="num font-bold text-ink">
              {shown.readiness_p10.toFixed(0)}
            </span>
            {" · "}
            Median:{" "}
            <span className="num font-bold text-ink">
              {shown.readiness_p50.toFixed(0)}
            </span>
            {" · "}
            Runs ≥ {result.goal.readiness}:{" "}
            <span className="num font-bold text-ink">
              {(shown.probability * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function OptimizeContent() {
  const { day } = useMission();
  const searchParams = useSearchParams();

  const queryCrew = searchParams.get("crew");

  const [crewId, setCrewId] = useState(
    queryCrew && CREW_TABS.some((c) => c.id === queryCrew)
      ? queryCrew
      : "rahman"
  );

  const [goal, setGoal] = useState(75);
  const [prob, setProb] = useState(0.9);
  const [adherence, setAdherence] = useState(false);

  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Run optimizer through backend API
  const run = async () => {
    setBusy(true);
    setError(null);

    try {
      setResult(
        await api("/optimize", {
          method: "POST",
          body: {
            crew_id: crewId,
            day,
            goal_readiness: goal,
            goal_probability: prob,
            include_adherence: adherence,
          },
        })
      );
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">

      {/* Page heading */}
      <section className="space-y-3">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Countermeasure optimizer
        </h1>

        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          Runs the simulator backwards: tries all 56 plans
          (0–7 resistance days × 0–60 min cardio) with 200
          Monte Carlo runs each and returns the cheapest plan
          that keeps arrival readiness above your goal.
        </p>

        <SimulatedNote />
      </section>

      {/* Main layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">

        {/* Goal settings */}
        <Card className="space-y-5 lg:sticky lg:top-40 lg:self-start">

          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-accent" />
            <h2 className="text-lg font-bold">Goal</h2>
          </div>

          {/* Crew selection */}
          <label className="block text-sm font-semibold">
            Crew member

            <select
              value={crewId}
              onChange={(e) => setCrewId(e.target.value)}
              className="card-flat mt-2 h-11 w-full px-3 text-sm text-ink outline-none focus:border-accent"
            >
              {CREW_TABS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          {/* Readiness goal */}
          <div>
            <label className="flex items-center justify-between gap-2 text-sm font-semibold">
              <span>Arrival readiness at least</span>

              <span className="num text-accent">
                {goal}
              </span>
            </label>

            <input
              type="range"
              min={50}
              max={90}
              value={goal}
              onChange={(e) => setGoal(Number(e.target.value))}
              className="mt-3 w-full accent-[var(--accent)]"
            />

            <div className="num flex justify-between text-xs text-muted">
              <span>50</span>
              <span>90</span>
            </div>
          </div>

          {/* Probability goal */}
          <label className="block text-sm font-semibold">
            In this share of Monte Carlo runs

            <select
              value={prob}
              onChange={(e) => setProb(Number(e.target.value))}
              className="card-flat mt-2 h-11 w-full px-3 text-sm text-ink outline-none focus:border-accent"
            >
              {[0.5, 0.75, 0.9, 0.95].map((p) => (
                <option key={p} value={p}>
                  {Math.round(p * 100)}%
                </option>
              ))}
            </select>
          </label>

          {/* Adherence toggle */}
          <div className="border-t border-[var(--border)] pt-4">
            <Toggle
              checked={adherence}
              onChange={setAdherence}
              label="Assume the astronaut's usual adherence (not 100%)"
            />
          </div>

          <p className="text-xs leading-relaxed text-muted">
            Plan starts on mission day {day ?? "…"}; the logged
            history before that is fixed. Move the mission clock
            to day 0 to plan the whole transit.
          </p>

          {/* Optimize button */}
          <button
            onClick={run}
            disabled={busy || day == null}
            className="btn flex w-full items-center justify-center gap-2 disabled:opacity-50"
          >
            <Play className="h-4 w-4" aria-hidden />

            {busy ? "Searching 56 plans..." : "Optimize"}
          </button>
        </Card>

        {/* Results section */}
        <div className="space-y-6">

          <ErrorBox error={error} />

          {/* Loading */}
          {busy && !result && (
            <Card>
              <Loading label="Simulating 11,200 missions..." />
            </Card>
          )}

          {/* Results */}
          {result && (
            <>
              {/* Best plan */}
              <Card
                className={
                  result.best
                    ? "!border-go/40"
                    : "!border-warn/40"
                }
              >
                <p
                  className="text-sm font-bold"
                  style={{
                    color: result.best
                      ? "#35d6a0"
                      : "#ffb23e",
                  }}
                >
                  {result.message}
                </p>

                <div className="display mt-3 text-2xl font-extrabold leading-tight sm:text-3xl">
                  {result.best
                    ? `${result.best.resistance_days} resistance days + ${result.best.cardio_min} min cardio`
                    : "No passing plan found"}
                </div>

                <div className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-4">
                  <Metric
                    label="Plan"
                    value={
                      result.best
                        ? `${result.best.resistance_days}d + ${result.best.cardio_min}m`
                        : "—"
                    }
                    sub="Days/week + cardio/day"
                  />

                  <Metric
                    label="Exercise time"
                    value={
                      result.best
                        ? `${(result.best.weekly_minutes / 60).toFixed(1)} h`
                        : "—"
                    }
                    sub={`Default ${(result.default_weekly_minutes / 60).toFixed(0)} h/week`}
                  />

                  <Metric
                    label="Readiness P10"
                    value={(result.best || result.closest).readiness_p10.toFixed(0)}
                    sub="1-in-10 worst case"
                  />

                  <Metric
                    label="Runs ≥ goal"
                    value={`${Math.round(
                      (result.best || result.closest).probability * 100
                    )}%`}
                    sub={`${result.runs_per_plan} runs per plan`}
                  />
                </div>
              </Card>

              {/* All plans heatmap */}
              <Card className={busy ? "opacity-70" : ""}>
                <h2 className="text-lg font-bold">
                  All 56 plans
                </h2>

                <p className="mb-4 mt-1 text-xs text-muted">
                  Resistance days per week and cardio minutes per day.
                  Colour represents the probability of reaching readiness{" "}
                  {result.goal.readiness}.
                </p>

                <Heatmap result={result} />
              </Card>
            </>
          )}

          {/* Empty state */}
          {!result && !busy && (
            <Card>
              <div className="py-10 text-center">
                <Target className="mx-auto h-8 w-8 text-muted" />

                <p className="mt-3 text-sm font-semibold">
                  Ready to optimize?
                </p>

                <p className="mt-1 text-xs text-muted">
                  Set your goals and press Optimize to compare all 56 plans.
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// Suspense boundary for Next.js useSearchParams
export default function OptimizePage() {
  return (
    <Suspense fallback={<Loading label="Loading optimizer..." />}>
      <OptimizeContent />
    </Suspense>
  );
}
