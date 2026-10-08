"use client";
import { useMemo } from "react";
import { useMission } from "@/lib/mission";
import { DOSE_MAP, EVENTS, FLUX_MIN, SAMPLE_KS, eventDose, fmtDate, isSheltered, missionInfo, shipState, type Band, type Scale } from "@/lib/engine";
import { BandChart, Card } from "@/components/ui";

const SOURCES = [
  ["NASA CCMC DONKI", "Solar particle events and flares"],
  ["NOAA SWPC proton event list", "Peak flux above 10 MeV, sets the storm size"],
  ["JPL Horizons", "Earth position, drives distance and signal delay"],
];

export default function SpaceWeather() {
  const { day } = useMission();
  const traj = useMemo(() => SAMPLE_KS.map((k) => missionInfo(k)), []);
  const flat = (f: (i: ReturnType<typeof missionInfo>) => number): Band[] => traj.map((t) => [f(t), f(t), f(t)]);
  const maxDose = Math.max(...EVENTS.map(eventDose));
  const W = 640, H = 200, L = 40, R = 12, T = 22, B = 26;
  const x = (d: number) => L + (d / 270) * (W - L - R);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h1 className="text-3xl font-extrabold sm:text-4xl">Space weather</h1>
        <p className="max-w-2xl text-muted">Solar particle events add dose on top of the steady cosmic ray background. The same event hurts more the farther the ship is from the Sun's shielding, and less when the crew reaches the storm shelter.</p>
      </div>

      <Card>
        <h2 className="mb-3 text-lg font-bold">Data sources</h2>
        <ul className="grid gap-3 md:grid-cols-3">
          {SOURCES.map(([n, d]) => (
            <li key={n} className="card-flat p-4"><div className="flex items-center justify-between gap-2"><span className="text-sm font-bold">{n}</span><span className="rounded-full bg-warn/15 px-2.5 py-0.5 text-[11px] font-bold text-warn">Sample data</span></div><p className="mt-1.5 text-xs text-muted">{d}</p></li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">The frontend ships with built-in sample events so it runs offline. The FastAPI backend serves the cached NASA and NOAA data.</p>
      </Card>

      <Card>
        <h2 className="text-lg font-bold">Dose from each event</h2>
        <p className="mb-3 mt-1 text-xs text-muted">Millisieverts inside the hull at the ship&apos;s distance from the Sun.</p>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Dose per solar event along the mission" style={{ touchAction: "pan-y" }}>
          <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke="rgba(255,255,255,.12)" />
          {[0, 90, 180, 270].map((d) => <text key={d} x={x(d)} y={H - 8} fontSize="11" fill="#8c919e" textAnchor={d === 0 ? "start" : d === 270 ? "end" : "middle"} className="num">Day {d}</text>)}
          {EVENTS.map((e) => {
            const h = Math.max(4, (eventDose(e) / maxDose) * (H - T - B - 8));
            return (
              <g key={e.day} opacity={e.day < day ? 0.45 : 1}>
                <rect x={x(e.day) - 6} y={H - B - h} width="12" height={h} rx="4" fill={isSheltered(e.scale) ? "#6f8cff" : "#ff4a2b"} />
                <text x={x(e.day)} y={H - B - h - 6} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#f4f5f7">{e.scale}</text>
              </g>
            );
          })}
          <line x1={x(day)} x2={x(day)} y1={T - 6} y2={H - B} stroke="#f4f5f7" strokeOpacity=".5" strokeDasharray="3 4" />
        </svg>
        <div className="mt-2 flex gap-5 text-xs text-muted"><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-accent" />No shelter</span><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: "#6f8cff" }} />Crew sheltered</span></div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card><h2 className="mb-2 font-bold">Distance from the Sun (AU)</h2><BandChart label="Distance from Sun" ks={SAMPLE_KS} bands={flat((t) => t.rSun)} today={day} color="#ffb23e" fmt={(v) => v.toFixed(2)} /></Card>
        <Card><h2 className="mb-2 font-bold">One-way signal delay (minutes)</h2><BandChart label="Signal delay" ks={SAMPLE_KS} bands={flat((t) => t.delayMin)} today={day} color="#6f8cff" yMin={0} fmt={(v) => v.toFixed(1)} /></Card>
      </div>

      <Card>
        <h2 className="mb-3 text-lg font-bold">Events</h2>
        <div className="scroll-x">
          <table className="num w-full min-w-[560px] text-sm">
            <thead><tr className="text-left text-xs text-muted"><th className="pb-2 font-semibold">Date</th><th className="pb-2 font-semibold">Scale</th><th className="pb-2 font-semibold">Peak flux</th><th className="pb-2 font-semibold">Sun distance</th><th className="pb-2 font-semibold">Shelter</th><th className="pb-2 text-right font-semibold">Dose</th></tr></thead>
            <tbody>
              {EVENTS.map((e) => (
                <tr key={e.day} className={`border-t border-line ${e.day < day ? "text-muted" : ""}`}>
                  <td className="py-3">{fmtDate(e.day)}</td><td className="py-3 font-bold">{e.scale}</td><td className="py-3">{e.flux} pfu</td>
                  <td className="py-3">{shipState(e.day).r.toFixed(2)} AU</td><td className="py-3">{isSheltered(e.scale) ? "Yes" : "No"}</td><td className="py-3 text-right font-bold">{eventDose(e).toFixed(2)} mSv</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-bold">Storm scale to dose</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {(Object.keys(DOSE_MAP) as Scale[]).map((s) => (
            <div key={s} className="card-flat p-4"><div className="display text-xl font-bold text-accent">{s}</div><div className="num mt-1 text-xs text-muted">{FLUX_MIN[s].toLocaleString()} pfu or more</div><div className="num mt-0.5 text-sm font-bold">{DOSE_MAP[s]} mSv at 1 AU</div></div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">Dose scales with (1 AU / distance) squared and drops to 20% when the crew shelters. Both are labelled assumptions.</p>
      </Card>
    </div>
  );
}
