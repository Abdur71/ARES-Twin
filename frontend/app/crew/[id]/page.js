
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  Activity,
  Bell,
  Radiation,
  Stethoscope,
  Trash2,
} from "lucide-react";

import {
  DoseChart,
  ForecastChart,
  Gauge,
  RadiationMeter,
} from "@/components/charts";

import {
  AlertsList,
  ErrorBox,
  Loading,
  SimulatedNote,
  StatusPill,
  Card,
  Metric,
} from "@/components/ui";

import { AstronautViewer } from "@/components/Scene3D";
import BodyTwin from "@/components/BodyTwin";
import { api, useApi } from "@/lib/api";
import { useMission } from "@/lib/mission";
import { CREW_TABS, METRICS, SERIES } from "@/lib/theme";
import { scoreOf, statusColor } from "@/lib/engine";

const RATE_LABEL = {
  bone: {
    label: "Hip bone loss rate",
    fmt: (v) => `${(v * 100).toFixed(2)} %/mo`,
  },
  muscle: {
    label: "Muscle loss multiplier",
    fmt: (v) => `${v.toFixed(2)}×`,
  },
  cardio: {
    label: "Cardio decline multiplier",
    fmt: (v) => `${v.toFixed(2)}×`,
  },
};

// Measurement form
function MeasurementForm({ crewId, baseline, day, onSaved }) {
  const [form, setForm] = useState({
    day: day || 30,
    metric: "bone",
    value: "",
  });

  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const m = METRICS[form.metric];

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await api(`/crew/${crewId}/measurements`, {
        method: "POST",
        body: {
          ...form,
          day: Number(form.day),
          value: Number(form.value),
        },
      });

      setForm((f) => ({ ...f, value: "" }));
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"
    >
      <label className="flex flex-col gap-1.5 font-semibold text-muted">
        Mission day
        <input
          type="number"
          min={1}
          max={270}
          required
          value={form.day}
          onChange={(e) =>
            setForm({ ...form, day: e.target.value })
          }
          className="card-flat h-11 w-full px-3 text-ink outline-none focus:border-accent"
        />
      </label>

      <label className="flex flex-col gap-1.5 font-semibold text-muted">
        Metric
        <select
          value={form.metric}
          onChange={(e) =>
            setForm({ ...form, metric: e.target.value })
          }
          className="card-flat h-11 w-full px-3 text-ink outline-none focus:border-accent"
        >
          {Object.entries(METRICS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5 font-semibold text-muted">
        Value ({m?.unit || "%"})
        <input
          type="number"
          step="any"
          required
          value={form.value}
          placeholder={`Baseline ${baseline?.[m?.baselineKey] || ""}`}
          onChange={(e) =>
            setForm({ ...form, value: e.target.value })
          }
          className="card-flat h-11 w-full px-3 text-ink outline-none focus:border-accent"
        />
      </label>

      <button
        disabled={busy}
        className="btn self-end justify-center disabled:opacity-50"
      >
        {busy ? "Saving..." : "Add check-up"}
      </button>

      {error && (
        <p className="col-span-full text-sm text-stop">
          {error}
        </p>
      )}
    </form>
  );
}

// Main Crew Twin Page
export default function CrewTwinPage() {
  const { id } = useParams();
  const { day } = useMission();

  const [gcr, setGcr] = useState("design_goal");
  const [twinView, setTwinView] = useState("arrival");

  const {
    data,
    error,
    loading,
    reload,
  } = useApi(
    day == null
      ? null
      : `/crew/${id}?day=${day}&gcr_scenario=${gcr}`
  );

  // Delete measurement
  const removeMeasurement = async (mid) => {
    await api(`/crew/${id}/measurements/${mid}`, {
      method: "DELETE",
    });

    reload();
  };

  // Crew navigation tabs
  const tabs = (
    <nav
      aria-label="Crew member"
      className="flex flex-wrap gap-2"
    >
      {CREW_TABS.map((c) => (
        <Link
          key={c.id}
          href={`/crew/${c.id}`}
          className={`pill px-4 py-2 text-sm font-semibold transition-colors ${
            c.id === id
              ? "border-accent bg-accent/15 text-ink"
              : "text-muted hover:text-ink"
          }`}
        >
          {c.name}
        </Link>
      ))}
    </nav>
  );

  if (error) {
    return (
      <div className="space-y-5">
        {tabs}
        <ErrorBox error={error} onRetry={reload} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-5">
        {tabs}
        <Loading />
      </div>
    );
  }

  const {
    profile,
    arrival,
    today,
    radiation,
    series,
    measurements,
    rates,
  } = data;

  const col = statusColor[arrival.status] || "#ff4a2b";

  const lossPoints = (metric) =>
    measurements
      .filter((m) => m.metric === metric)
      .map((m) => ({
        day: m.day,
        value: (1 - m.rel_value) * 100,
      }));

  // Calculate today's scores
  const todayScores = scoreOf(
    today.loss.bone.p50,
    today.loss.muscle.p50,
    today.loss.cardio.p50
  );

  // Body twin view
  const shownBody =
    twinView === "arrival"
      ? {
          bone: {
            score: arrival.subscores.bone,
            loss: arrival.loss.bone.p50,
          },
          muscle: {
            score: arrival.subscores.muscle,
            loss: arrival.loss.muscle.p50,
          },
          cardio: {
            score: arrival.subscores.cardio,
            loss: arrival.loss.cardio.p50,
          },
        }
      : {
          bone: {
            score: todayScores.sb,
            loss: today.loss.bone.p50,
          },
          muscle: {
            score: todayScores.sm,
            loss: today.loss.muscle.p50,
          },
          cardio: {
            score: todayScores.sc,
            loss: today.loss.cardio.p50,
          },
        };

  return (
    <div className={`space-y-6 ${loading ? "opacity-70 transition-opacity" : ""}`}>
      {tabs}

      {/* Astronaut Hero Section */}
      <section className="card overflow-hidden">
        <div className="grid items-center lg:grid-cols-[minmax(0,380px)_1fr]">
          <div className="h-72 sm:h-96 lg:h-[420px]">
            <AstronautViewer tint={col} />
          </div>

          <div className="space-y-5 p-6 sm:p-9">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-extrabold sm:text-4xl">
                {profile.name}
              </h1>

              <StatusPill status={arrival.status} size="lg" />
            </div>

            <p className="text-sm text-muted">
              {profile.role} · age {profile.age} · adherence{" "}
              {(profile.compliance * 100).toFixed(0)}% · sleeps{" "}
              {profile.sleep_mean_h} h · prior dose{" "}
              {profile.prior_dose_msv} mSv
            </p>

            <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
              <Metric
                label="Readiness on arrival"
                value={arrival.readiness.p50.toFixed(0)}
                sub={`P5 ${arrival.readiness.p5.toFixed(0)} to P95 ${arrival.readiness.p95.toFixed(0)}`}
                tone={col}
              />

              <Metric
                label="Readiness today"
                value={todayScores.readiness.toFixed(0)}
                sub={`Mission day ${day ?? 0}`}
                tone={statusColor[arrival.status]}
              />

              <Metric
                label="Career dose arrival"
                value={radiation.arrival_msv.toFixed(0)}
                sub="mSv of 600"
              />

              <Metric
                label="Career dose today"
                value={radiation.used_msv.toFixed(0)}
                sub={`mSv used (${(radiation.used_fraction * 100).toFixed(0)}%)`}
              />
            </div>

            <div className="flex flex-wrap gap-3 pt-1">
              <Link href={`/whatif?crew=${id}`} className="btn">
                Run a what-if
              </Link>

              <Link
                href={`/optimize?crew=${id}`}
                className="btn btn-quiet"
              >
                Find cheapest plan
              </Link>
            </div>

            <SimulatedNote />
          </div>
        </div>
      </section>

      {/* Body Twin & Alerts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]">

        {/* Body Twin */}
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold">
              Body twin
            </h2>

            <div
              className="pill flex p-1 text-sm font-semibold"
              role="group"
              aria-label="Twin timeframe"
            >
              {["today", "arrival"].map((v) => (
                <button
                  key={v}
                  onClick={() => setTwinView(v)}
                  aria-pressed={twinView === v}
                  className={`rounded-full px-4 py-1.5 transition-colors ${
                    twinView === v
                      ? "bg-accent text-white"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {v === "today"
                    ? `Today (Day ${day ?? 0})`
                    : "On arrival"}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <BodyTwin {...shownBody} />
          </div>

          <div className="mt-2 grid grid-cols-3 gap-2 border-t border-[var(--border)] pt-4">
            <Gauge
              label="Bone"
              value={shownBody.bone.score}
              caption={`${(shownBody.bone.loss * 100).toFixed(1)}% loss`}
            />

            <Gauge
              label="Muscle"
              value={shownBody.muscle.score}
              caption={`${(shownBody.muscle.loss * 100).toFixed(1)}% loss`}
            />

            <Gauge
              label="Cardio"
              value={shownBody.cardio.score}
              caption={`${(shownBody.cardio.loss * 100).toFixed(1)}% loss`}
            />
          </div>
        </Card>

        {/* Alerts */}
        <Card className="flex flex-col">
          <h2 className="text-xl font-bold">
            Alerts & Mission events
          </h2>

          <div className="mt-4">
            <AlertsList alerts={data.alerts} />
          </div>

          <h3 className="mb-2 mt-6 text-sm font-bold text-muted">
            Recent disruptions
          </h3>

          <ul className="max-h-52 space-y-2 overflow-auto pr-1 text-sm">
            {data.log_events
              .filter((e) => e.day < day)
              .reverse()
              .map((e) => (
                <li
                  key={e.day}
                  className="card-flat flex gap-3 p-3"
                >
                  <span className="num shrink-0 text-xs font-bold text-accent">
                    Day {e.day}
                  </span>

                  <span className="text-sm text-ink">
                    {e.label}
                  </span>
                </li>
              ))}

            {!data.log_events.some((e) => e.day < day) && (
              <li className="text-sm text-muted">
                No disruptions logged yet.
              </li>
            )}
          </ul>
        </Card>
      </div>

      {/* Forecast to Arrival */}
      <section>
        <h2 className="mb-4 text-xl font-bold">
          Forecast to arrival
        </h2>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <h3 className="mb-3 font-bold">
              Readiness score (0–100)
            </h3>

            <ForecastChart
              title="Readiness score (0–100)"
              band={series.readiness}
              currentDay={day}
              unit=""
              digits={0}
              yDomain={[0, 100]}
              refLines={[
                { y: 70, label: "GREEN ≥ 70" },
                { y: 50, label: "AMBER ≥ 50" },
              ]}
            />
          </Card>

          <Card>
            <h3 className="mb-3 font-bold">
              Hip bone density loss
            </h3>

            <ForecastChart
              title="Hip bone density loss"
              band={series.bone}
              currentDay={day}
              points={lossPoints("bone")}
              refLines={[{ y: 20, label: "Limit 20%" }]}
            />
          </Card>

          <Card>
            <h3 className="mb-3 font-bold">
              Leg muscle loss
            </h3>

            <ForecastChart
              title="Leg muscle loss"
              band={series.muscle}
              currentDay={day}
              points={lossPoints("muscle")}
              refLines={[{ y: 50, label: "Limit 50%" }]}
            />
          </Card>

          <Card>
            <h3 className="mb-3 font-bold">
              VO2peak loss
            </h3>

            <ForecastChart
              title="VO2peak loss"
              band={series.cardio}
              currentDay={day}
              points={lossPoints("cardio")}
              refLines={[{ y: 40, label: "Limit 40%" }]}
            />
          </Card>
        </div>
      </section>

      {/* Radiation Budget */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">
              Radiation budget
            </h2>

            <p className="mt-1 text-sm text-muted">
              Shown separately from readiness: long-term cumulative risk,
              not daily physical fitness.
            </p>
          </div>

          <div
            className="pill flex p-1 text-sm font-semibold"
            role="group"
            aria-label="GCR dose rate scenario"
          >
            {[
              ["design_goal", "Design goal 1.3"],
              ["measured", "Measured 1.84"],
            ].map(([k, label]) => (
              <button
                key={k}
                onClick={() => setGcr(k)}
                aria-pressed={gcr === k}
                className={`rounded-full px-3.5 py-1.5 transition-colors ${
                  gcr === k
                    ? "bg-accent text-white"
                    : "text-muted hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4 mt-5 flex flex-wrap items-center gap-3">
          <StatusPill status={radiation.status} />

          <span className="text-sm text-muted">
            {(radiation.arrival_fraction * 100).toFixed(0)}% of the
            career limit at arrival; a full conjunction-class mission
            reaches {radiation.end_of_mission_msv.toFixed(0)} mSv.
          </span>
        </div>

        <RadiationMeter budget={radiation} />

        <div className="mt-5">
          <DoseChart
            dose={series.dose}
            currentDay={day}
            events={data.radiation_events.filter(
              (e) => e.s_level >= 1
            )}
          />
        </div>
      </Card>

      {/* Check-ups */}
      <Card>
        <div className="mb-5">
          <h2 className="text-xl font-bold">
            Check-ups personalise the twin
          </h2>

          <p className="mt-1 text-sm text-muted">
            Each measurement updates this astronaut&apos;s personal rates
            (closed-form Bayesian update); the forecast band narrows.
          </p>
        </div>

        <MeasurementForm
          crewId={id}
          baseline={profile.baseline}
          day={day}
          onSaved={reload}
        />

        {measurements.length > 0 && (
          <ul className="mt-4 space-y-2 text-sm">
            {measurements.map((m) => (
              <li
                key={m.id}
                className="card-flat flex items-center justify-between gap-3 p-3"
              >
                <span className="text-ink">
                  Day {m.day} · {METRICS[m.metric]?.label || m.metric}:{" "}
                  <span className="num font-semibold">
                    {m.value} {m.unit}
                  </span>

                  <span className="ml-1 text-xs text-muted">
                    ({((m.rel_value - 1) * 100).toFixed(1)}%)
                  </span>
                </span>

                <button
                  onClick={() => removeMeasurement(m.id)}
                  className="rounded-lg p-2 text-muted transition-colors hover:bg-stop/10 hover:text-stop"
                  aria-label="Delete measurement"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs font-semibold text-muted">
              <tr>
                <th className="py-3 pr-3">Personal rate</th>
                <th className="py-3 pr-3">Pre-flight estimate</th>
                <th className="py-3">Twin now</th>
              </tr>
            </thead>

            <tbody className="text-ink">
              {Object.entries(rates).map(([k, r]) => (
                <tr
                  key={k}
                  className="border-t border-[var(--border)]"
                >
                  <td className="py-3 pr-3 font-semibold">
                    {RATE_LABEL[k]?.label || k}
                  </td>

                  <td className="num py-3 pr-3 text-muted">
                    {RATE_LABEL[k]?.fmt(r.prior_mean) || r.prior_mean}
                    {" ± "}
                    {RATE_LABEL[k]?.fmt(r.prior_sd) || r.prior_sd}
                  </td>

                  <td
                    className="num py-3"
                    style={{
                      color:
                        r.posterior_sd < r.prior_sd - 1e-9
                          ? SERIES.blue
                          : undefined,
                    }}
                  >
                    {RATE_LABEL[k]?.fmt(r.posterior_mean) || r.posterior_mean}
                    {" ± "}
                    {RATE_LABEL[k]?.fmt(r.posterior_sd) || r.posterior_sd}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
