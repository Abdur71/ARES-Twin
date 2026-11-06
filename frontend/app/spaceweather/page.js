
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

const STATUS_TONE = {
  live: "text-go",
  cache: "text-go",
  "stale-cache": "text-warn",
  partial: "text-warn",
  error: "text-stop",
  unavailable: "text-stop",
};

export default function SpaceWeatherPage() {
  const { day } = useMission();
  const { data, error, loading, reload } = useApi("/spaceweather");

  const [refreshing, setRefreshing] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await api("/spaceweather?refresh=true");
      reload();
    } finally {
      setRefreshing(false);
    }
  };

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading label="Loading space weather..." />;

  const noaaEvents = data.events.filter((e) => e.s_level >= 1);
  const tableEvents = showAll ? data.events : noaaEvents;

  return (
    <div className={`space-y-6 ${loading ? "opacity-70" : ""}`}>

      {/* Header */}
      <section className="space-y-3">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Space weather
        </h1>

        <p className="max-w-3xl text-sm leading-relaxed text-muted">
          The simulated crew lives through the real solar weather of{" "}
          <span className="font-semibold text-ink">
            {data.mission_start} → day {data.mission_days}
          </span>
          . NOAA supplies each event&apos;s size (peak greater than 10 MeV
          proton flux), while NASA DONKI supplies the event records, which are
          de-duplicated (
          {data.raw_counts.donki_sep_records} instrument records →{" "}
          {data.events.length} events).
        </p>
      </section>

      {/* Data Sources */}
      <Panel
        title="Data sources"
        icon={Database}
        subtitle="One request per source per window (DONKI in ≤60-day chunks), cached as JSON — the demo works offline."
        actions={
          <button
            onClick={refresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-2 text-xs font-bold text-accent transition hover:bg-accent/20 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
              aria-hidden
            />
            Re-check
          </button>
        }
      >
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {Object.entries(data.sources).map(([key, source]) => (
            <li key={key} className="card-flat p-4">
              <div className="flex items-start justify-between gap-3">
                <span className="text-sm font-bold text-ink">
                  {SOURCE_LABEL[key] || key}
                </span>

                <span
                  className={`shrink-0 rounded-full bg-panel px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                    STATUS_TONE[source.status] || "text-muted"
                  }`}
                >
                  {source.status}
                </span>
              </div>

              <div className="num mt-2 text-[11px] text-muted">
                {source.requests
                  ? `${source.requests} cached chunks`
                  : source.fetched_at
                    ? `Fetched ${source.fetched_at
                        .slice(0, 16)
                        .replace("T", " ")} UTC`
                    : source.error || "No fetch information"}
              </div>
            </li>
          ))}
        </ul>

        <p className="num mt-4 text-xs text-muted">
          Trajectory: {data.trajectory_model}
          {data.offline_mode ? " · Offline mode (cache only)" : ""}
        </p>
      </Panel>

      {/* Solar Particle Events */}
      <Panel
        title="Solar particle events"
        icon={Sun}
        subtitle="Dose shrinks with distance (1/r²) as the ship moves away from the Sun. The crew shelters for S2 and above by default (shelter passes 20%)."
      >
        <EventChart events={noaaEvents} currentDay={day} />

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <h3 className="num text-xs font-bold uppercase tracking-wider text-muted">
            {tableEvents.length} events
          </h3>

          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--accent)]"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
            />
            Include DONKI-only events below S1 at Earth
          </label>
        </div>

        {/* Events Table */}
        <div className="scroll-x mt-3">
          <table className="num w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                {[
                  "Day",
                  "Date",
                  "Scale",
                  "Peak pfu",
                  "Flare",
                  "DONKI recs",
                  "r (AU)",
                  "Dose @1 AU",
                  "Dose @ craft",
                  "Shelter",
                  "Source",
                ].map((heading) => (
                  <th key={heading} className="pb-3 pr-3 font-semibold">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {tableEvents.map((event) => (
                <tr
                  key={event.id}
                  className={`border-t border-line ${
                    event.day < (day ?? 0) ? "text-muted" : "text-ink"
                  }`}
                >
                  <td className="py-3 pr-3">{event.day}</td>
                  <td className="py-3 pr-3">{event.date}</td>
                  <td className="py-3 pr-3 font-bold">{event.s_scale}</td>
                  <td className="py-3 pr-3">
                    {event.peak_pfu ?? "—"}
                  </td>
                  <td className="py-3 pr-3">{event.flare || "—"}</td>
                  <td className="py-3 pr-3">{event.donki_records}</td>
                  <td className="py-3 pr-3">
                    {event.r_au.toFixed(2)}
                  </td>
                  <td className="py-3 pr-3">
                    {event.dose_1au_msv}
                  </td>
                  <td className="py-3 pr-3">
                    {event.dose_at_craft_msv}
                  </td>
                  <td className="py-3 pr-3">
                    {event.shelter_default ? "Yes" : "No"}
                  </td>
                  <td className="py-3 pr-3">
                    {event.links?.[0] ? (
                      <a
                        href={event.links[0]}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-semibold text-accent hover:underline"
                      >
                        {event.source}
                        <ExternalLink
                          className="h-3 w-3"
                          aria-hidden
                        />
                      </a>
                    ) : (
                      event.source
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Trajectory and Dose Map */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

        {/* Trajectory */}
        <Panel
          title="Trajectory"
          icon={Orbit}
          className="lg:col-span-2"
          subtitle="Earth from JPL Horizons; spacecraft on a Hohmann-type transfer stretched to 270 days."
        >
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="card-flat p-3">
              <h3 className="mb-3 text-sm font-bold text-ink">
                Distance from the Sun (AU)
              </h3>

              <LineSeriesChart
                title="Distance from the Sun (AU)"
                values={data.trajectory.map((t) => t.r_au)}
                currentDay={day}
                unit=" AU"
              />
            </div>

            <div className="card-flat p-3">
              <h3 className="mb-3 text-sm font-bold text-ink">
                One-way comm delay to Earth (min)
              </h3>

              <LineSeriesChart
                title="One-way comm delay to Earth (min)"
                values={data.trajectory.map((t) => t.comm_delay_min)}
                currentDay={day}
                unit=" min"
                digits={1}
              />
            </div>
          </div>
        </Panel>

        {/* Dose Map */}
        <Panel
          title="Dose map"
          subtitle="NOAA S-scale → unsheltered dose inside the hull at 1 AU, log-log interpolated on peak flux."
        >
          <div className="overflow-x-auto">
            <table className="num w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-2 font-semibold">Scale</th>
                  <th className="py-2 font-semibold">Peak ≥ pfu</th>
                  <th className="py-2 text-right font-semibold">Dose</th>
                </tr>
              </thead>

              <tbody>
                {data.dose_map.map((item) => (
                  <tr
                    key={item.scale}
                    className="border-t border-line"
                  >
                    <td className="py-3 font-bold text-accent">
                      {item.scale}
                    </td>
                    <td className="py-3">
                      {item.pfu.toLocaleString()}
                    </td>
                    <td className="py-3 text-right font-bold">
                      {item.dose_msv} mSv
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}
