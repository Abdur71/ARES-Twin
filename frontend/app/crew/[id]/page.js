"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Activity, Bell, ClipboardList, Radiation, Stethoscope, Trash2 } from "lucide-react";
import { DoseChart, ForecastChart, Gauge, RadiationMeter } from "@/components/charts";
import { AlertsList, ErrorBox, Loading, Panel, SimulatedNote, StatusPill } from "@/components/ui";
import { api, useApi } from "@/lib/api";
import { useMission } from "@/lib/mission";
import { CREW_TABS, METRICS, SERIES } from "@/lib/theme";

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
      <label className="flex flex-col gap-1 text-slate-400">Value ({m.unit})
        <input type="number" step="any" required value={form.value} placeholder={`baseline ${baseline[m.baselineKey]}`}
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
  const { data, error, loading, reload } = useApi(day == null ? null : `/crew/${id}?day=${day}&gcr_scenario=${gcr}`);

  const removeMeasurement = async (mid) => {
    await api(`/crew/${id}/measurements/${mid}`, { method: "DELETE" });
    reload();
  };

  const tabs = (
    <nav aria-label="Crew member" className="flex flex-wrap gap-1">
      {CREW_TABS.map((c) => (
        <Link key={c.id} href={`/crew/${c.id}`}
          className={`rounded-md px-3 py-1.5 text-xs ${c.id === id ? "bg-slate-800 text-white ring-1 ring-slate-600" : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"}`}>
          {c.name}
        </Link>
      ))}
    </nav>
  );

  if (error) return <div className="space-y-4">{tabs}<ErrorBox error={error} onRetry={reload} /></div>;
  if (!data) return <div className="space-y-4">{tabs}<Loading /></div>;

  const { profile, arrival, today, radiation, series, measurements, rates } = data;
  const lossPoints = (metric) => measurements.filter((m) => m.metric === metric).map((m) => ({ day: m.day, value: (1 - m.rel_value) * 100 }));

  return (
    <div className={`space-y-6 ${loading ? "opacity-70 transition-opacity" : ""}`}>
      {tabs}
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">{profile.name}</h1>
          <p className="text-sm text-slate-400">{profile.role} · age {profile.age} · usual adherence {(profile.compliance * 100).toFixed(0)}% · sleeps {profile.sleep_mean_h} h · prior dose {profile.prior_dose_msv} mSv</p>
          <SimulatedNote className="mt-1" />
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="font-mono text-[11px] uppercase tracking-wider text-slate-400">Arrival readiness</div>
            <div className="text-4xl font-bold tabular-nums text-white">{arrival.readiness.p50.toFixed(0)}</div>
            <div className="font-mono text-[11px] text-slate-400">P5–P95 {arrival.readiness.p5.toFixed(0)}–{arrival.readiness.p95.toFixed(0)}</div>
          </div>
          <StatusPill status={arrival.status} size="lg" />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel title="System gauges" icon={Activity} subtitle="Arrival-day sub-scores (1 = no loss, 0 = limit reached)" className="lg:col-span-2">
          <div className="grid grid-cols-3 gap-2">
            {["bone", "muscle", "cardio"].map((k) => (
              <Gauge key={k} label={METRICS[k].short} value={arrival.subscores[k]}
                caption={`${(arrival.loss[k].p50 * 100).toFixed(1)}% loss`} />
            ))}
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
            {Object.entries(METRICS).map(([k, m]) => (
              <div key={k} className="rounded-lg border border-slate-800 bg-slate-900/40 p-2.5">
                <div className="text-slate-400">{m.label} today</div>
                <div className="font-mono text-sm text-slate-100">
                  {data.today_absolute[m.baselineKey]} <span className="text-slate-500">/ {profile.baseline[m.baselineKey]} {m.unit}</span>
                </div>
                <div className="font-mono text-[11px] text-slate-400">−{(today.loss[k].p50 * 100).toFixed(1)}% so far</div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Alerts" icon={Bell}>
          <AlertsList alerts={data.alerts} />
        </Panel>
      </div>

      <Panel title="Forecast to arrival" icon={Activity}
        subtitle={`Median and P5–P95 band of 500 Monte Carlo runs. Days before ${day} use the logged history; after it, current habits continue.`}>
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

      <Panel title="Radiation budget" icon={Radiation}
        subtitle="Shown separately from readiness: a long-term cancer risk, not fitness on landing day."
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Check-ups personalise the twin" icon={Stethoscope}
          subtitle="Each measurement updates this astronaut's personal rates (closed-form Bayesian update); the forecast band narrows.">
          <MeasurementForm crewId={id} baseline={profile.baseline} day={day} onSaved={reload} />
          {measurements.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs">
              {measurements.map((m) => (
                <li key={m.id} className="flex items-center justify-between rounded border border-slate-800 bg-slate-900/40 px-2 py-1.5">
                  <span className="text-slate-300">Day {m.day} · {METRICS[m.metric].label}: <span className="font-mono">{m.value} {m.unit}</span>
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
                  <td className="py-1.5 font-sans text-slate-300">{RATE_LABEL[k].label}</td>
                  <td>{RATE_LABEL[k].fmt(r.prior_mean)} ± {RATE_LABEL[k].fmt(r.prior_sd)}</td>
                  <td style={{ color: r.posterior_sd < r.prior_sd - 1e-9 ? SERIES.blue : undefined }}>
                    {RATE_LABEL[k].fmt(r.posterior_mean)} ± {RATE_LABEL[k].fmt(r.posterior_sd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Mission log" icon={ClipboardList} subtitle="Disruptions in the generated daily logs up to today.">
          <ul className="max-h-80 space-y-1 overflow-auto text-xs">
            {data.log_events.filter((e) => e.day < day).reverse().map((e) => (
              <li key={e.day} className="flex gap-3 border-b border-slate-800/70 py-1.5">
                <span className="w-14 shrink-0 font-mono text-slate-500">Day {e.day}</span>
                <span className="text-slate-300">{e.label}</span>
              </li>
            ))}
            {!data.log_events.some((e) => e.day < day) && <li className="text-slate-500">No disruptions yet.</li>}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
