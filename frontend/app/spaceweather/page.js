"use client";

import { useState } from "react";
import { Database, ExternalLink, Orbit, RefreshCw, Sun } from "lucide-react";
import { EventChart, LineSeriesChart } from "@/components/charts";
import { ErrorBox, Loading, Panel } from "@/components/ui";
import { api, useApi } from "@/lib/api";
import { useMission } from "@/lib/mission";

const SOURCE_LABEL = {
  donki_sep: "NASA CCMC DONKI — solar particle events",
  donki_flr: "NASA CCMC DONKI — flares",
  noaa_spe_list: "NOAA SWPC solar proton event list",
  jpl_horizons: "JPL Horizons — Earth ephemeris",
};

const STATUS_TONE = { live: "text-emerald-300", cache: "text-emerald-300", "stale-cache": "text-amber-300", partial: "text-amber-300", error: "text-rose-300", unavailable: "text-rose-300" };

export default function SpaceWeatherPage() {
  const { day } = useMission();
  const { data, error, loading, reload } = useApi("/spaceweather");
  const [refreshing, setRefreshing] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try { await api("/spaceweather?refresh=true"); reload(); } finally { setRefreshing(false); }
  };

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading label="Loading space weather…" />;

  const noaaEvents = data.events.filter((e) => e.s_level >= 1);
  const tableEvents = showAll ? data.events : noaaEvents;

  return (
    <div className={`space-y-6 ${loading ? "opacity-70" : ""}`}>
      <section>
        <h1 className="text-3xl font-bold tracking-tight text-white">Space weather replay</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          The simulated crew lives through the <strong className="text-slate-200">real</strong> solar weather of {data.mission_start} → day {data.mission_days}.
          NOAA supplies each event&apos;s size (peak &gt;10 MeV proton flux); NASA DONKI supplies the event records, which are
          de-duplicated ({data.raw_counts.donki_sep_records} instrument records → {data.events.length} events).
        </p>
      </section>

      <Panel title="Data sources" icon={Database} subtitle="One request per source per window (DONKI in ≤60-day chunks), cached as JSON — the demo works offline."
        actions={
          <button onClick={refresh} disabled={refreshing} className="inline-flex items-center gap-1.5 rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden /> Re-check
          </button>
        }>
        <ul className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
          {Object.entries(data.sources).map(([k, s]) => (
            <li key={k} className="rounded-lg border border-slate-800 bg-slate-900/40 p-2.5">
              <div className="flex justify-between gap-2">
                <span className="text-slate-200">{SOURCE_LABEL[k]}</span>
                <span className={`font-mono uppercase ${STATUS_TONE[s.status] || "text-slate-300"}`}>{s.status}</span>
              </div>
              <div className="mt-1 font-mono text-[10px] text-slate-500">
                {s.requests ? `${s.requests} cached chunks` : s.fetched_at ? `fetched ${s.fetched_at.slice(0, 16).replace("T", " ")} UTC` : s.error}
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 font-mono text-[11px] text-slate-500">Trajectory: {data.trajectory_model}{data.offline_mode ? " · offline mode (cache only)" : ""}</p>
      </Panel>

      <Panel title="Solar particle events" icon={Sun} subtitle="Dose shrinks with distance (1/r²) as the ship moves away from the Sun. The crew shelters for S2 and above by default (shelter passes 20%).">
        <EventChart events={noaaEvents} currentDay={day} />
        <div className="mt-4 flex items-center justify-between">
          <h3 className="font-mono text-[11px] uppercase tracking-wider text-slate-400">{tableEvents.length} events</h3>
          <label className="text-xs text-slate-400">
            <input type="checkbox" className="mr-1.5 accent-cyan-500" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            include DONKI-only events below S1 at Earth
          </label>
        </div>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="font-mono text-[11px] text-slate-400">
              <tr>{["Day", "Date", "Scale", "Peak pfu", "Flare", "DONKI recs", "r (AU)", "Dose @1 AU", "Dose @ craft", "Shelter", "Source"].map((h) => <th key={h} className="py-1.5 pr-3 font-normal">{h}</th>)}</tr>
            </thead>
            <tbody className="text-slate-200">
              {tableEvents.map((e) => (
                <tr key={e.id} className={`border-t border-slate-800 ${e.day < (day ?? 0) ? "text-slate-400" : ""}`}>
                  <td className="py-1.5 pr-3 font-mono">{e.day}</td>
                  <td className="pr-3 font-mono">{e.date}</td>
                  <td className="pr-3 font-mono">{e.s_scale}</td>
                  <td className="pr-3 font-mono">{e.peak_pfu ?? "—"}</td>
                  <td className="pr-3">{e.flare || "—"}</td>
                  <td className="pr-3 font-mono">{e.donki_records}</td>
                  <td className="pr-3 font-mono">{e.r_au.toFixed(2)}</td>
                  <td className="pr-3 font-mono">{e.dose_1au_msv}</td>
                  <td className="pr-3 font-mono">{e.dose_at_craft_msv}</td>
                  <td className="pr-3">{e.shelter_default ? "yes" : "no"}</td>
                  <td className="pr-3">
                    {e.links?.[0] ? (
                      <a href={e.links[0]} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-cyan-300 hover:underline">
                        {e.source} <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    ) : e.source}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel title="Trajectory" icon={Orbit} className="lg:col-span-2" subtitle="Earth from JPL Horizons; spacecraft on a Hohmann-type transfer stretched to 270 days.">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <LineSeriesChart title="Distance from the Sun (AU)" values={data.trajectory.map((t) => t.r_au)} currentDay={day} unit=" AU" />
            <LineSeriesChart title="One-way comm delay to Earth (min)" values={data.trajectory.map((t) => t.comm_delay_min)} currentDay={day} unit=" min" digits={1} />
          </div>
        </Panel>
        <Panel title="Dose map (assumption)" subtitle="NOAA S-scale → unsheltered dose inside the hull at 1 AU, log-log interpolated on peak flux.">
          <table className="w-full text-left text-xs">
            <thead className="font-mono text-[11px] text-slate-400"><tr><th className="py-1 font-normal">Scale</th><th className="font-normal">Peak ≥ pfu</th><th className="font-normal">Dose</th></tr></thead>
            <tbody className="font-mono text-slate-200">
              {data.dose_map.map((s) => (
                <tr key={s.scale} className="border-t border-slate-800"><td className="py-1.5">{s.scale}</td><td>{s.pfu.toLocaleString()}</td><td>{s.dose_msv} mSv</td></tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}
