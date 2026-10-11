"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Activity, Bell, ClipboardList, Radiation, Stethoscope, Trash2 } from "lucide-react";
import { DoseChart, ForecastChart, Gauge, RadiationMeter } from "@/components/charts";
import { AlertsList, ErrorBox, Loading, Panel, SimulatedNote, StatusPill, Card, Metric } from "@/components/ui";
import { AstronautViewer } from "@/components/Scene3D";
import BodyTwin from "@/components/BodyTwin";
import { api, useApi } from "@/lib/api";
import { useMission } from "@/lib/mission";
import { CREW_TABS, METRICS, SERIES } from "@/lib/theme";
import { scoreOf, statusColor } from "@/lib/engine";

const RATE_LABEL = {
  bone: { label: "Hip bone loss rate", fmt: (v) => `${(v * 100).toFixed(2)} %/mo` },
  muscle: { label: "Muscle loss multiplier", fmt: (v) => `${v.toFixed(2)}×` },
  cardio: { label: "Cardio decline multiplier", fmt: (v) => `${v.toFixed(2)}×` },
};

function MeasurementForm({ crewId, baseline, day, onSaved }) {
  const [form, setForm] = useState({ day: day || 30, metric: "bone", value: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const m = METRICS[form.metric];
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/crew/${crewId}/measurements`, { method: "POST", body: { ...form, day: Number(form.day), value: Number(form.value) } });
      setForm((f) => ({ ...f, value: "" }));
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
      <label className="flex flex-col gap-1 text-slate-400">Mission day
        <input type="number" min={1} max={270} required value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })}
          className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100" />
      </label>
      <label className="flex flex-col gap-1 text-slate-400">Metric
        <select value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value })}
          className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100">
          {Object.entries(METRICS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-slate-400">Value ({m?.unit || "%"})
        <input type="number" step="any" required value={form.value} placeholder={`baseline ${baseline?.[m?.baselineKey] || ""}`}
          onChange={(e) => setForm({ ...form, value: e.target.value })}
          className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-100" />
      </label>
      <button disabled={busy} className="self-end rounded-md border border-cyan-500/40 bg-cyan-500/15 px-3 py-1.5 font-medium text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-50">
        {busy ? "Saving…" : "Add check-up"}
      </button>
      {error && <p className="col-span-full text-rose-300">{error}</p>}
    </form>
  );
}

export default function CrewTwinPage() {
  const { id } = useParams();
  const { day } = useMission();
  const [gcr, setGcr] = useState("design_goal");
  const [twinView, setTwinView] = useState("arrival"); // "today" | "arrival"
  const { data, error, loading, reload } = useApi(day == null ? null : `/crew/${id}?day=${day}&gcr_scenario=${gcr}`);

  const removeMeasurement = async (mid) => {
    await api(`/crew/${id}/measurements/${mid}`, { method: "DELETE" });
    reload();
  };

  const tabs = (
    <nav aria-label="Crew member" className="flex flex-wrap gap-1">
      {CREW_TABS.map((c) => (
        <Link key={c.id} href={`/crew/${c.id}`}
          className={`rounded-md px-3 py-1.5 text-xs transition-colors ${c.id === id ? "bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-500/40 font-semibold" : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"}`}>
          {c.name}
        </Link>
      ))}
    </nav>
  );

  if (error) return <div className="space-y-4">{tabs}<ErrorBox error={error} onRetry={reload} /></div>;
  if (!data) return <div className="space-y-4">{tabs}<Loading /></div>;

  const { profile, arrival, today, radiation, series, measurements, rates } = data;
  const col = statusColor[arrival.status] || "#06b6d4";
  const lossPoints = (metric) => measurements.filter((m) => m.metric === metric).map((m) => ({ day: m.day, value: (1 - m.rel_value) * 100 }));

  // Compute values for BodyTwin based on view toggle
  const todayScores = scoreOf(today.loss.bone.p50, today.loss.muscle.p50, today.loss.cardio.p50);
  const shownBody = twinView === "arrival"
    ? {
        bone: { score: arrival.subscores.bone, loss: arrival.loss.bone.p50 },
        muscle: { score: arrival.subscores.muscle, loss: arrival.loss.muscle.p50 },
        cardio: { score: arrival.subscores.cardio, loss: arrival.loss.cardio.p50 },
      }
    : {
        bone: { score: todayScores.sb, loss: today.loss.bone.p50 },
        muscle: { score: todayScores.sm, loss: today.loss.muscle.p50 },
        cardio: { score: todayScores.sc, loss: today.loss.cardio.p50 },
      };

  return (
    <div className={`space-y-6 ${loading ? "opacity-70 transition-opacity" : ""}`}>
      {tabs}

      {/* 3D Astronaut Hero Card */}
      <section className="card overflow-hidden border border-cyan-500/20 bg-gradient-to-b from-[#0a101f] to-[#050814]">
        <div className="grid items-center lg:grid-cols-[minmax(0,360px)_1fr]">
          <div className="h-72 sm:h-96 lg:h-[400px] border-b lg:border-b-0 lg:border-r border-cyan-900/30">
            <AstronautViewer tint={col} />
          </div>
          <div className="space-y-5 p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-3xl font-extrabold sm:text-4xl text-white">{profile.name}</h1>
                <p className="mt-1 text-sm text-slate-400">
                  {profile.role} · age {profile.age} · adherence {(profile.compliance * 100).toFixed(0)}% · sleeps {profile.sleep_mean_h} h · prior dose {profile.prior_dose_msv} mSv
                </p>
              </div>
              <StatusPill status={arrival.status} size="lg" />
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Metric label="Readiness on arrival" value={arrival.readiness.p50.toFixed(0)} sub={`P5 ${arrival.readiness.p5.toFixed(0)} to P95 ${arrival.readiness.p95.toFixed(0)}`} tone={col} />
              <Metric label="Readiness today" value={todayScores.readiness.toFixed(0)} sub={`Mission day ${day ?? 0}`} tone={statusColor[arrival.status]} />
              <Metric label="Career dose arrival" value={`${radiation.arrival_msv.toFixed(0)}`} sub="mSv of 600" />
              <Metric label="Career dose today" value={`${radiation.used_msv.toFixed(0)}`} sub={`mSv used (${(radiation.used_fraction * 100).toFixed(0)}%)`} />
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <Link href={`/whatif?crew=${id}`} className="btn">Run a what-if</Link>
              <Link href={`/optimize?crew=${id}`} className="btn btn-quiet">Find cheapest plan</Link>
            </div>
            <SimulatedNote />
          </div>
        </div>
      </section>

      {/* Body Twin & Alerts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Panel
          title="Body twin"
          icon={Activity}
          subtitle="Vector anatomical digital twin showing hip bone density, leg muscle volume and aerobic fitness."
          actions={
            <div className="pill flex p-1 text-xs font-semibold" role="group" aria-label="Twin timeframe">
              {["today", "arrival"].map((v) => (
                <button
                  key={v}
                  onClick={() => setTwinView(v)}
                  className={`rounded-full px-3.5 py-1 transition-colors ${twinView === v ? "bg-cyan-500 text-slate-950 font-bold" : "text-slate-400 hover:text-slate-200"}`}
                >
                  {v === "today" ? `Today (Day ${day ?? 0})` : "On arrival"}
                </button>
              ))}
            </div>
          }
        >
          <div className="mt-2">
            <BodyTwin {...shownBody} />
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-800/80 pt-4">
            <Gauge label="Bone" value={shownBody.bone.score} caption={`${(shownBody.bone.loss * 100).toFixed(1)}% loss`} />
            <Gauge label="Muscle" value={shownBody.muscle.score} caption={`${(shownBody.muscle.loss * 100).toFixed(1)}% loss`} />
            <Gauge label="Cardio" value={shownBody.cardio.score} caption={`${(shownBody.cardio.loss * 100).toFixed(1)}% loss`} />
          </div>
        </Panel>

        <Panel title="Alerts & Mission events" icon={Bell} subtitle="Personalised warnings and operational events.">
          <AlertsList alerts={data.alerts} />
          <h3 className="mb-2 mt-6 font-mono text-[11px] uppercase tracking-wider text-slate-400">Recent disruptions</h3>
          <ul className="max-h-52 space-y-1.5 overflow-auto text-xs">
            {data.log_events.filter((e) => e.day < day).reverse().map((e) => (
              <li key={e.day} className="flex gap-3 rounded border border-slate-800 bg-slate-900/40 px-2 py-1.5">
                <span className="w-14 shrink-0 font-mono text-cyan-400">Day {e.day}</span>
                <span className="text-slate-300">{e.label}</span>
              </li>
            ))}
            {!data.log_events.some((e) => e.day < day) && <li className="text-slate-500">No disruptions logged yet.</li>}
          </ul>
        </Panel>
      </div>

      {/* Forecast to arrival */}
      <Panel title="Forecast to arrival" icon={Activity}
        subtitle={`Median and P5–P95 band of 500 Monte Carlo runs. Days before ${day} use logged history; after it, current habits continue.`}>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <ForecastChart title="Readiness score (0–100)" band={series.readiness} currentDay={day} unit="" digits={0} yDomain={[0, 100]}
            refLines={[{ y: 70, label: "GREEN ≥ 70" }, { y: 50, label: "AMBER ≥ 50" }]} />
          <ForecastChart title="Hip bone density loss" band={series.bone} currentDay={day} points={lossPoints("bone")}
            refLines={[{ y: 20, label: "Limit 20%" }]} />
          <ForecastChart title="Leg muscle loss" band={series.muscle} currentDay={day} points={lossPoints("muscle")}
            refLines={[{ y: 50, label: "Limit 50%" }]} />
          <ForecastChart title="VO2peak loss" band={series.cardio} currentDay={day} points={lossPoints("cardio")}
            refLines={[{ y: 40, label: "Limit 40%" }]} />
        </div>
      </Panel>

      {/* Radiation budget */}
      <Panel title="Radiation budget" icon={Radiation}
        subtitle="Shown separately from readiness: long-term cumulative risk, not daily physical fitness."
        actions={
          <div className="flex rounded-md border border-slate-700 text-[11px]" role="group" aria-label="GCR dose rate scenario">
            {[["design_goal", "Design goal 1.3"], ["measured", "Measured 1.84"]].map(([k, l]) => (
              <button key={k} onClick={() => setGcr(k)}
                className={`px-2.5 py-1 ${gcr === k ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"}`}>{l} mSv/d</button>
            ))}
          </div>
        }>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <StatusPill status={radiation.status} />
          <span className="text-xs text-slate-400">
            {(radiation.arrival_fraction * 100).toFixed(0)}% of the career limit at arrival; a full conjunction-class mission reaches {radiation.end_of_mission_msv.toFixed(0)} mSv.
          </span>
        </div>
        <RadiationMeter budget={radiation} />
        <div className="mt-5"><DoseChart dose={series.dose} currentDay={day} events={data.radiation_events.filter((e) => e.s_level >= 1)} /></div>
      </Panel>

      {/* Check-ups personalize the twin */}
      <Panel title="Check-ups personalise the twin" icon={Stethoscope}
        subtitle="Each measurement updates this astronaut's personal rates (closed-form Bayesian update); the forecast band narrows.">
        <MeasurementForm crewId={id} baseline={profile.baseline} day={day} onSaved={reload} />
        {measurements.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs">
            {measurements.map((m) => (
              <li key={m.id} className="flex items-center justify-between rounded border border-slate-800 bg-slate-900/40 px-2 py-1.5">
                <span className="text-slate-300">Day {m.day} · {METRICS[m.metric]?.label || m.metric}: <span className="font-mono">{m.value} {m.unit}</span>
                  <span className="text-slate-500"> ({((m.rel_value - 1) * 100).toFixed(1)}%)</span></span>
                <button onClick={() => removeMeasurement(m.id)} className="text-slate-500 hover:text-rose-300" aria-label="Delete measurement">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <table className="mt-4 w-full text-left text-xs">
          <thead className="font-mono text-[11px] text-slate-400">
            <tr><th className="py-1 font-normal">Personal rate</th><th className="font-normal">Pre-flight estimate</th><th className="font-normal">Twin now</th></tr>
          </thead>
          <tbody className="font-mono text-slate-200">
            {Object.entries(rates).map(([k, r]) => (
              <tr key={k} className="border-t border-slate-800">
                <td className="py-1.5 font-sans text-slate-300">{RATE_LABEL[k]?.label || k}</td>
                <td>{RATE_LABEL[k]?.fmt(r.prior_mean) || r.prior_mean} ± {RATE_LABEL[k]?.fmt(r.prior_sd) || r.prior_sd}</td>
                <td style={{ color: r.posterior_sd < r.prior_sd - 1e-9 ? SERIES.blue : undefined }}>
                  {RATE_LABEL[k]?.fmt(r.posterior_mean) || r.posterior_mean} ± {RATE_LABEL[k]?.fmt(r.posterior_sd) || r.posterior_sd}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
