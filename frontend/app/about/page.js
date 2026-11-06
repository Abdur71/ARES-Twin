
"use client";

import {
  BookOpen,
  Database,
  FunctionSquare,
  ShieldAlert,
  Table2,
} from "lucide-react";

import { ErrorBox, Loading, Panel } from "@/components/ui";
import { useApi } from "@/lib/api";

const SOURCES = [
  ["NASA CCMC DONKI", "Solar particle events & flares (≤60-day requests, no key)", "https://ccmc.gsfc.nasa.gov/tools/DONKI/"],
  ["NOAA SWPC solar proton event list", "Peak >10 MeV flux per event (NCEI copy)", "https://www.ngdc.noaa.gov/stp/space-weather/interplanetary-data/solar-proton-events/SEP%20page%20code.html"],
  ["JPL Horizons", "Earth ephemeris → distance from Sun and communication delay", "https://ssd-api.jpl.nasa.gov/doc/horizons.html"],
  ["NOAA Space Weather Scales", "S1–S5 thresholds", "https://www.swpc.noaa.gov/noaa-scales-explanation"],
  ["LeBlanc et al. 2000", "Hip 1.4–1.5%/month, spine 0.9%/month", null],
  ["Trappe et al. 2009, J Appl Physiol", "Calf muscle −13% in 6 months with exercise", null],
  ["NASA NTRS (muscle & cardiorespiratory)", "VO2peak, muscle, strength −10 to −15%", null],
  ["Zeitlin et al. 2013; Hassler et al. 2014", "MSL/RAD cruise ~1.84, surface ~0.64 mSv/day", null],
  ["NASA-STD-3001 / OCHMO", "600 mSv career limit, short-term limits, design goals", null],
];

const LIMITATIONS = [
  "The astronauts are simulated; no individual astronaut data is used (it is held under controlled access in NASA LSDA).",
  "The models are first-order equations, not full physiology.",
  "k_bone, r_none, the sleep penalty, V_floor, the shelter factor and the S-scale dose map are assumptions and tunable.",
  "Converting an Earth-observed solar event into a dose at the spacecraft is a simplification (1/r² scaling; real exposure depends on magnetic connectivity, particle spectrum and shielding).",
  "The spacecraft follows a nominal transfer ellipse during a historical replay window, not a real launch opportunity.",
  "The effect of Mars's 0.38 g on bone is unknown; this version models the transit only.",
  "ARES Twin is decision support for crew and flight surgeons — not a diagnostic or medical device.",
];

const tag = (type) =>
  type === "Assumption"
    ? "bg-warn/12 text-warn"
    : "bg-go/12 text-go";

export default function AboutPage() {
  const { data, error, reload } = useApi("/model");

  return (
    <div className="space-y-6">

      {/* Page heading */}
      <section className="space-y-3">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          About the model
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-muted">
          Every number the twin uses, where it comes from, and where the
          model stops. Values marked Assumption are ours and tunable.
        </p>
      </section>

      <ErrorBox error={error} onRetry={reload} />

      {!data ? (
        <Loading label="Loading model registry…" />
      ) : (
        <>
          {/* Equations and readiness */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

            <Panel title="Equations (updated once per simulated day)" icon={FunctionSquare}>
              <div className="space-y-3">
                {Object.entries(data.equations).map(([key, eq]) => (
                  <div
                    key={key}
                    className="rounded-xl border border-line bg-black/20 p-3"
                  >
                    <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
                      {key}
                    </p>
                    <pre className="num mt-2 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink">
                      {eq}
                    </pre>
                  </div>
                ))}
              </div>

              <p className="mt-4 text-sm leading-relaxed text-muted">
                Prescription = {data.prescription.resistance_min} min resistance
                × 7 days + {data.prescription.cardio_min} min cardio per day.
                Forecasts use {data.monte_carlo_runs} Monte Carlo runs with
                personal rates drawn around each astronaut&apos;s estimate (±12–15%).
              </p>
            </Panel>

            <Panel title="Readiness score" icon={Table2}>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-muted">
                    <tr>
                      <th className="py-2 font-medium">System</th>
                      <th className="font-medium">Score = 0 at loss</th>
                      <th className="font-medium">Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(data.readiness.limits).map((key) => (
                      <tr key={key} className="border-t border-line">
                        <td className="py-3 capitalize">{key}</td>
                        <td className="num">
                          {data.readiness.limits[key] * 100}%
                        </td>
                        <td className="num">
                          {data.readiness.weights[key]}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 space-y-2 text-sm">
                <p>
                  <b className="text-go">GREEN</b> ≥ {data.readiness.green_min}
                </p>
                <p>
                  <b className="text-warn">AMBER</b> ≥ {data.readiness.amber_min}
                </p>
                <p>
                  <b className="text-stop">RED</b> below
                </p>
                <p className="text-muted">
                  Any sub-score under {data.readiness.subscore_cap} caps the
                  status at AMBER. Radiation is reported separately as a
                  career dose budget (600 mSv).
                </p>
              </div>

              <h3 className="mt-5 text-sm font-bold">
                Cosmic-ray dose scenarios
              </h3>

              <ul className="mt-3 space-y-2 text-sm text-muted">
                {Object.entries(data.gcr_scenarios).map(([key, scenario]) => (
                  <li
                    key={key}
                    className="rounded-lg border border-line p-3"
                  >
                    <span className="font-semibold text-ink">
                      {scenario.label}
                    </span>
                    <p className="mt-1">
                      {scenario.transit} mSv/day in transit,
                      {" "}{scenario.surface} mSv/day on the surface
                    </p>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          {/* Parameter table */}
          <Panel title="Parameter table" icon={BookOpen}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-xs text-muted">
                  <tr className="border-b border-line">
                    <th className="py-3 text-left font-medium">Parameter</th>
                    <th className="text-left font-medium">Value</th>
                    <th className="text-left font-medium">Type</th>
                    <th className="text-left font-medium">Source</th>
                  </tr>
                </thead>

                <tbody>
                  {data.parameters.map((p) => (
                    <tr key={p.key} className="border-t border-line">
                      <td className="py-3 pr-3 font-semibold">{p.label}</td>
                      <td className="pr-3 text-muted">
                        <span className="num">
                          {p.value} {p.unit}
                        </span>
                      </td>
                      <td className="pr-3">
                        <span
                          className={`inline-block rounded-full px-2.5 py-1 text-xs font-bold ${
                            tag(p.type)
                          }`}
                        >
                          {p.type}
                        </span>
                      </td>
                      <td className="text-muted">{p.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          {/* Data sources and limitations */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

            <Panel title="Data & sources" icon={Database}>
              <ul className="space-y-3 text-sm">
                {SOURCES.map(([name, description, url]) => (
                  <li key={name} className="leading-relaxed">
                    {url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-go hover:underline"
                      >
                        {name}
                      </a>
                    ) : (
                      <span className="font-semibold">{name}</span>
                    )}
                    <span className="text-muted">
                      {" "}— {description}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-4 rounded-xl border border-line bg-black/20 p-3">
                <p className="text-sm leading-relaxed text-muted">
                  <span className="font-semibold text-ink">Crew:</span> four
                  fictional astronauts built as a virtual population.
                  Personal rates are drawn from published means and spreads,
                  with baselines inside NHANES ranges for healthy adults
                  aged 35–50.
                </p>
              </div>
            </Panel>

            <Panel title="Known limitations" icon={ShieldAlert}>
              <ul className="list-disc space-y-3 pl-5 text-sm leading-relaxed text-muted">
                {LIMITATIONS.map((limitation) => (
                  <li key={limitation}>{limitation}</li>
                ))}
              </ul>
            </Panel>

          </div>
        </>
      )}
    </div>
  );
}
