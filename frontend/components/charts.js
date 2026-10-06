"use client";

import { useMemo, useState } from "react";
import {
  Area, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis,
} from "recharts";
import { CHART, SERIES } from "@/lib/theme";

const axisProps = {
  stroke: CHART.axis,
  tick: { fill: CHART.tick, fontSize: 11 },
  tickLine: false,
};

function TooltipBox({ active, payload, label, rows }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-md border border-slate-700 bg-slate-950/95 px-3 py-2 text-[11px] text-slate-200 shadow-xl">
      <div className="mb-1 font-mono text-slate-400">Mission day {label}</div>
      {rows(row).filter(Boolean).map(([k, v, color]) => (
        <div key={k} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-slate-300">
            {color && <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />}{k}
          </span>
          <span className="font-mono tabular-nums">{v}</span>
        </div>
      ))}
    </div>
  );
}

function TodayLine({ day }) {
  if (day == null) return null;
  return (
    <ReferenceLine x={day} stroke="#64748b" strokeWidth={1}
      label={{ value: "Today", position: "insideTopLeft", fill: CHART.tick, fontSize: 10 }} />
  );
}

function DataTable({ rows, columns }) {
  return (
    <div className="mt-2 max-h-56 overflow-auto rounded border border-slate-800">
      <table className="w-full text-left font-mono text-[11px] text-slate-300">
        <thead className="sticky top-0 bg-slate-900 text-slate-400">
          <tr>{columns.map((c) => <th key={c.key} className="px-2 py-1 font-normal">{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.day} className="border-t border-slate-800/70">
              {columns.map((c) => <td key={c.key} className="px-2 py-1 tabular-nums">{c.format ? c.format(r[c.key]) : r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableToggle({ children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1">
      <button type="button" onClick={() => setOpen((o) => !o)} className="font-mono text-[10px] uppercase tracking-wider text-slate-500 hover:text-cyan-300">
        {open ? "Hide table" : "Show table"}
      </button>
      {open && children}
    </div>
  );
}

/** One series: median line + P5–P95 band, with optional check-up points and limit lines. */
export function ForecastChart({
  title, band, currentDay, unit = "%", color = SERIES.blue, refLines = [], points = [], height = 210, digits = 1, yDomain,
}) {
  const data = useMemo(() => {
    const byDay = Object.fromEntries(points.map((p) => [p.day, p.value]));
    return band.p50.map((m, day) => ({ day, p50: m, band: [band.p5[day], band.p95[day]], measured: byDay[day] }));
  }, [band, points]);
  const f = (v) => `${Number(v).toFixed(digits)}${unit}`;
  return (
    <figure>
      <figcaption className="mb-1 text-xs font-medium text-slate-300">{title}</figcaption>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={CHART.grid} vertical={false} />
            <XAxis dataKey="day" type="number" domain={[0, data.length - 1]} ticks={[0, 60, 120, 180, 240, 270]} {...axisProps} />
            <YAxis {...axisProps} width={48} domain={yDomain || ["auto", "auto"]} tickFormatter={(v) => `${v}${unit}`} />
            <Tooltip
              cursor={{ stroke: "#475569", strokeWidth: 1 }}
              content={<TooltipBox rows={(r) => [
                ["Median", f(r.p50), color],
                ["P5–P95", `${f(r.band[0])} – ${f(r.band[1])}`],
                r.measured != null && ["Check-up", f(r.measured), "#e2e8f0"],
              ]} />}
            />
            {refLines.map((r) => (
              <ReferenceLine key={r.label} y={r.y} stroke={r.color || "#475569"} strokeWidth={1}
                label={{ value: r.label, position: "insideTopRight", fill: CHART.tick, fontSize: 10 }} />
            ))}
            <Area dataKey="band" stroke="none" fill={color} fillOpacity={0.18} isAnimationActive={false} />
            <Line dataKey="p50" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
            {points.length > 0 && (
              <Scatter dataKey="measured" fill="#e2e8f0" stroke={CHART.surface} strokeWidth={2} shape="circle" isAnimationActive={false} />
            )}
            <TodayLine day={currentDay} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <TableToggle>
        <DataTable
          rows={data.filter((r) => r.day % 30 === 0 || r.day === data.length - 1)}
          columns={[
            { key: "day", label: "Day" },
            { key: "p50", label: "Median", format: f },
            { key: "band", label: "P5 – P95", format: (b) => `${f(b[0])} – ${f(b[1])}` },
          ]}
        />
      </TableToggle>
    </figure>
  );
}

/** Two medians (baseline vs scenario) with legend + end labels. */
export function CompareChart({
  title, a, b, labels = ["Nothing changes", "Scenario"], currentDay, unit = "%", refLines = [], height = 220, digits = 1,
  yDomain = ["auto", "auto"],
}) {
  const data = useMemo(() => a.map((v, day) => ({ day, a: v, b: b[day] })), [a, b]);
  const f = (v) => `${Number(v).toFixed(digits)}${unit}`;
  const last = data[data.length - 1];
  return (
    <figure>
      <figcaption className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-xs font-medium text-slate-300">
        {title}
        <span className="font-mono text-[11px] font-normal text-slate-400">
          arrival: <span style={{ color: SERIES.blue }}>●</span> {f(last.a)} → <span style={{ color: SERIES.orange }}>●</span> {f(last.b)}
        </span>
      </figcaption>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={CHART.grid} vertical={false} />
            <XAxis dataKey="day" type="number" domain={[0, data.length - 1]} ticks={[0, 60, 120, 180, 240, 270]} {...axisProps} />
            <YAxis {...axisProps} width={48} tickFormatter={(v) => `${v}${unit}`} domain={yDomain} allowDataOverflow={false} />
            <Tooltip cursor={{ stroke: "#475569" }} content={<TooltipBox rows={(r) => [[labels[0], f(r.a), SERIES.blue], [labels[1], f(r.b), SERIES.orange]]} />} />
            <Legend verticalAlign="top" height={22} iconType="plainline" wrapperStyle={{ fontSize: 11, color: CHART.inkSecondary }} />
            {refLines.map((r) => (
              <ReferenceLine key={r.label} y={r.y} stroke="#475569" label={{ value: r.label, position: "insideTopRight", fill: CHART.tick, fontSize: 10 }} />
            ))}
            <Line name={labels[0]} dataKey="a" stroke={SERIES.blue} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line name={labels[1]} dataKey="b" stroke={SERIES.orange} strokeWidth={2} dot={false} isAnimationActive={false} />
            <TodayLine day={currentDay} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

/** Cumulative career dose with the 600 mSv limit and solar-event markers. */
export function DoseChart({ dose, currentDay, events = [], limit = 600, height = 210 }) {
  const data = useMemo(() => {
    const ev = {};
    events.forEach((e) => {
      if (e.day < dose.length - 1) ev[e.day + 1] = { ...e, at: dose[e.day + 1] };
    });
    return dose.map((v, day) => ({ day, dose: v, event: ev[day]?.at, info: ev[day] }));
  }, [dose, events]);
  return (
    <figure>
      <figcaption className="mb-1 text-xs font-medium text-slate-300">Career radiation dose (mSv)</figcaption>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={CHART.grid} vertical={false} />
            <XAxis dataKey="day" type="number" domain={[0, data.length - 1]} ticks={[0, 60, 120, 180, 240, 270]} {...axisProps} />
            <YAxis {...axisProps} width={48} domain={[0, Math.max(limit * 1.05, dose[dose.length - 1] * 1.05)]} />
            <Tooltip cursor={{ stroke: "#475569" }} content={<TooltipBox rows={(r) => [
              ["Career dose", `${r.dose.toFixed(0)} mSv`, SERIES.blue],
              r.info && ["Solar event", `${r.info.s_scale} · ${r.info.dose_at_craft_msv} mSv${r.info.sheltered ? " (sheltered ×0.2)" : ""}`],
            ]} />} />
            <ReferenceLine y={limit} stroke="#d03b3b" strokeWidth={1}
              label={{ value: `Career limit ${limit} mSv`, position: "insideTopRight", fill: "#f1a3a3", fontSize: 10 }} />
            <Line dataKey="dose" stroke={SERIES.blue} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Scatter dataKey="event" fill={SERIES.orange} stroke={CHART.surface} strokeWidth={2} isAnimationActive={false} />
            <TodayLine day={currentDay} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="font-mono text-[10px] text-slate-500"><span style={{ color: SERIES.orange }}>●</span> real solar particle events (NOAA ≥ S1)</p>
    </figure>
  );
}

/** A single plain series over mission days. */
export function LineSeriesChart({ title, values, currentDay, unit = "", digits = 2, height = 180, color = SERIES.blue }) {
  const data = useMemo(() => values.map((v, day) => ({ day, v })), [values]);
  const f = (v) => `${Number(v).toFixed(digits)}${unit}`;
  return (
    <figure>
      <figcaption className="mb-1 text-xs font-medium text-slate-300">{title}</figcaption>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={CHART.grid} vertical={false} />
            <XAxis dataKey="day" type="number" domain={[0, data.length - 1]} ticks={[0, 60, 120, 180, 240, 270]} {...axisProps} />
            <YAxis {...axisProps} width={48} domain={["auto", "auto"]} tickFormatter={(v) => `${v}`} />
            <Tooltip cursor={{ stroke: "#475569" }} content={<TooltipBox rows={(r) => [[title, f(r.v), color]]} />} />
            <Line dataKey="v" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
            <TodayLine day={currentDay} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

/** Solar particle events as dots: mission day vs dose at the spacecraft. */
export function EventChart({ events, currentDay, height = 220 }) {
  const data = events.map((e) => ({ day: e.day, dose: e.dose_at_craft_msv, e }));
  return (
    <figure>
      <figcaption className="mb-1 text-xs font-medium text-slate-300">Unsheltered SPE dose at the spacecraft (mSv) by mission day</figcaption>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={CHART.grid} vertical={false} />
            <XAxis dataKey="day" type="number" domain={[0, 270]} ticks={[0, 60, 120, 180, 240, 270]} {...axisProps} />
            <YAxis dataKey="dose" {...axisProps} width={48} />
            <Tooltip cursor={false} content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const e = payload[0].payload.e;
              return (
                <div className="rounded-md border border-slate-700 bg-slate-950/95 px-3 py-2 text-[11px] text-slate-200 shadow-xl">
                  <div className="font-mono text-slate-400">Day {e.day} · {e.date}</div>
                  <div>{e.s_scale} · peak {e.peak_pfu} pfu · flare {e.flare || "—"}</div>
                  <div>{e.dose_1au_msv} mSv at 1 AU → {e.dose_at_craft_msv} mSv at {e.r_au} AU</div>
                  <div className="text-slate-400">{e.donki_records} DONKI records merged</div>
                </div>
              );
            }} />
            <Scatter dataKey="dose" fill={SERIES.orange} stroke={CHART.surface} strokeWidth={2} isAnimationActive={false} />
            <TodayLine day={currentDay} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

/** Horizontal career-dose budget bar: used, projection to arrival, projection to end of mission. */
export function RadiationMeter({ budget, compact = false }) {
  const max = Math.max(budget.limit_msv, budget.end_of_mission_msv) * 1.04;
  const pct = (v) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div>
      <div className="relative h-4 overflow-hidden rounded-full bg-slate-800/80" role="img"
        aria-label={`Career dose ${budget.used_msv} mSv used, ${budget.arrival_msv} at arrival, limit ${budget.limit_msv}`}>
        <div className="absolute inset-y-0 left-0 bg-sky-900/70" style={{ width: pct(budget.end_of_mission_msv) }} />
        <div className="absolute inset-y-0 left-0 bg-sky-700/80" style={{ width: pct(budget.arrival_msv) }} />
        <div className="absolute inset-y-0 left-0 rounded-r-full" style={{ width: pct(budget.used_msv), background: SERIES.blue }} />
        <div className="absolute inset-y-0 w-0.5 bg-rose-500" style={{ left: pct(budget.limit_msv) }} title="Career limit" />
      </div>
      {!compact && (
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px] text-slate-300 sm:grid-cols-4">
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: SERIES.blue }} />Used {budget.used_msv.toFixed(0)}</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-700" />Arrival {budget.arrival_msv.toFixed(0)}</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-900" />Mission end {budget.end_of_mission_msv.toFixed(0)}</span>
          <span><span className="mr-1 inline-block h-2 w-0.5 bg-rose-500" />Limit {budget.limit_msv.toFixed(0)} mSv</span>
        </div>
      )}
    </div>
  );
}

/** Semicircle gauge for a 0–1 readiness sub-score. */
export function Gauge({ label, value, caption }) {
  const v = Math.max(0, Math.min(1, value));
  const angle = Math.PI * (1 - v);
  const x = 50 + 40 * Math.cos(angle);
  const y = 50 - 40 * Math.sin(angle);
  const color = v >= 0.7 ? "#0ca30c" : v >= 0.4 ? "#fab219" : "#d03b3b";
  const word = v >= 0.7 ? "good" : v >= 0.4 ? "watch" : "critical";
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 100 58" className="w-full max-w-[150px]" role="img" aria-label={`${label} sub-score ${v.toFixed(2)} (${word})`}>
        <path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="#1e293b" strokeWidth="8" strokeLinecap="round" />
        {v > 0.001 && (
          <path d={`M10 50 A40 40 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)}`} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" />
        )}
        <text x="50" y="47" textAnchor="middle" fontSize="15" fontWeight="700" fill="#f1f5f9">{v.toFixed(2)}</text>
      </svg>
      <div className="text-xs font-medium text-slate-200">{label}</div>
      <div className="font-mono text-[10px] text-slate-400">{word} · {caption}</div>
    </div>
  );
}
