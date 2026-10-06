"use client";

import { BookOpen, Database, FunctionSquare, ShieldAlert, Table2 } from "lucide-react";
import { ErrorBox, Loading, Panel } from "@/components/ui";
import { useApi } from "@/lib/api";

const SOURCES = [
  ["NASA CCMC DONKI", "Solar particle events & flares (≤60-day requests, no key)", "https://ccmc.gsfc.nasa.gov/tools/DONKI/"],
  ["NOAA SWPC solar proton event list", "Peak >10 MeV flux per event (NCEI copy)", "https://www.ngdc.noaa.gov/stp/space-weather/interplanetary-data/solar-proton-events/SEP%20page%20code.html"],
  ["JPL Horizons", "Earth ephemeris → distance from Sun and comm delay", "https://ssd-api.jpl.nasa.gov/doc/horizons.html"],
  ["NOAA Space Weather Scales", "S1–S5 thresholds", "https://www.swpc.noaa.gov/noaa-scales-explanation"],
  ["LeBlanc et al. 2000", "Hip 1.4–1.5 %/month, spine 0.9 %/month", null],
  ["Trappe et al. 2009, J Appl Physiol", "Calf muscle −13 % in 6 months with exercise", null],
  ["NASA NTRS (muscle & cardiorespiratory)", "VO2peak, muscle, strength −10 to −15 %", null],
  ["Zeitlin et al. 2013; Hassler et al. 2014", "MSL/RAD cruise ~1.84, surface ~0.64 mSv/day", null],
  ["NASA-STD-3001 / OCHMO", "600 mSv career limit, short-term limits, design goals", null],
];

const LIMITATIONS = [
  "The astronauts are simulated; no individual astronaut data is used (it is held under controlled access in NASA LSDA).",
  "The models are first-order equations, not full physiology.",
  "k_bone, r_none, the sleep penalty, V_floor, the shelter factor and the S-scale dose map are our assumptions, labelled below.",
  "Converting an Earth-observed solar event into a dose at the spacecraft is a simplification (1/r² scaling; real exposure depends on magnetic connectivity, particle spectrum and shielding).",
  "The spacecraft follows a nominal transfer ellipse during a historical replay window, not a real launch opportunity.",
  "The effect of Mars's 0.38 g on bone is unknown; this version models the transit only.",
  "ARES Twin is decision support for crew and flight surgeons — not a diagnostic or medical device.",
];

export default function AboutPage() {
  const { data, error, reload } = useApi("/model");
  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-3xl font-bold tracking-tight text-white">About the model</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          Every number the twin uses, where it comes from, and where the model stops. Values marked <em>Assumption</em> are ours and tunable.
        </p>
      </section>
      <ErrorBox error={error} onRetry={reload} />
      {!data ? <Loading label="Loading model registry…" /> : (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Panel title="Equations (updated once per simulated day)" icon={FunctionSquare}>
              <dl className="space-y-2 text-xs">
                {Object.entries(data.equations).map(([k, eq]) => (
                  <div key={k} className="rounded border border-slate-800 bg-slate-900/40 p-2">
                    <dt className="font-mono text-[10px] uppercase tracking-wider text-slate-400">{k}</dt>
                    <dd className="mt-0.5 font-mono text-slate-100">{eq}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-xs text-slate-400">
                Prescription = {data.prescription.resistance_min} min resistance × 7 days + {data.prescription.cardio_min} min cardio per day.
                Forecasts use {data.monte_carlo_runs} Monte Carlo runs with personal rates drawn around each astronaut&apos;s estimate (±12–15 %).
              </p>
            </Panel>
            <Panel title="Readiness score" icon={Table2}>
              <table className="w-full text-left text-xs">
                <thead className="font-mono text-[11px] text-slate-400"><tr><th className="py-1 font-normal">System</th><th className="font-normal">Score = 0 at loss</th><th className="font-normal">Weight</th></tr></thead>
                <tbody className="text-slate-200">
                  {Object.keys(data.readiness.limits).map((k) => (
                    <tr key={k} className="border-t border-slate-800">
                      <td className="py-1.5 capitalize">{k}</td>
                      <td className="font-mono">{data.readiness.limits[k] * 100}%</td>
                      <td className="font-mono">{data.readiness.weights[k]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-slate-300">
                GREEN ≥ {data.readiness.green_min} · AMBER ≥ {data.readiness.amber_min} · RED below. Any sub-score under {data.readiness.subscore_cap} caps the status at AMBER.
                Radiation is reported separately as a career dose budget (600 mSv).
              </p>
              <h3 className="mt-4 font-mono text-[11px] uppercase tracking-wider text-slate-400">Cosmic-ray dose scenarios</h3>
              <ul className="mt-1 space-y-1 text-xs text-slate-300">
                {Object.entries(data.gcr_scenarios).map(([k, s]) => (
                  <li key={k}>{s.label}: {s.transit} mSv/day in transit, {s.surface} on the surface</li>
                ))}
              </ul>
            </Panel>
          </div>

          <Panel title="Parameter table" icon={BookOpen}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead className="font-mono text-[11px] text-slate-400">
                  <tr><th className="py-1 font-normal">Parameter</th><th className="font-normal">Value</th><th className="font-normal">Type</th><th className="font-normal">Source</th></tr>
                </thead>
                <tbody className="text-slate-200">
                  {data.parameters.map((p) => (
                    <tr key={p.key} className="border-t border-slate-800">
                      <td className="py-1.5 pr-3">{p.label}</td>
                      <td className="pr-3 font-mono">{p.value} {p.unit}</td>
                      <td className={`pr-3 ${p.type === "Assumption" ? "text-amber-300" : "text-slate-300"}`}>{p.type}</td>
                      <td className="text-slate-400">{p.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Panel title="Data & sources" icon={Database}>
              <ul className="space-y-2 text-xs">
                {SOURCES.map(([name, what, url]) => (
                  <li key={name}>
                    {url ? <a href={url} target="_blank" rel="noreferrer" className="text-cyan-300 hover:underline">{name}</a> : <span className="text-slate-200">{name}</span>}
                    <span className="text-slate-400"> — {what}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-slate-400">
                Crew: four fictional astronauts built as a <em>virtual population</em> — personal rates drawn from published
                means and spreads, baselines inside NHANES ranges for healthy adults aged 35–50.
              </p>
            </Panel>
            <Panel title="Known limitations" icon={ShieldAlert}>
              <ul className="list-disc space-y-1.5 pl-4 text-xs text-slate-300">
                {LIMITATIONS.map((l) => <li key={l}>{l}</li>)}
              </ul>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
