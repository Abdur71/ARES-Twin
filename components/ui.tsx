"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { statusColor, statusLabel, type Band, type Status } from "@/lib/engine";

export function StatusPill({ status, className = "" }: { status: Status; className?: string }) {
  const c = statusColor[status];
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${className}`} style={{ background: `${c}1f`, color: c }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
      {statusLabel[status]}
    </span>
  );
}

export function Gauge({ value, label, color, size = 92, display }: { value: number; label?: string; color: string; size?: number; display?: string }) {
  const r = 38, C = 2 * Math.PI * r, v = Math.max(0, Math.min(1, value));
  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg width={size} height={size} viewBox="0 0 92 92" role="img" aria-label={`${label ?? "score"} ${display ?? Math.round(v * 100)}`}>
        <circle cx="46" cy="46" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
        <circle cx="46" cy="46" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${C * v} ${C}`} transform="rotate(-90 46 46)" style={{ transition: "stroke-dasharray .6s cubic-bezier(.2,.7,.2,1)" }} />
        <text x="46" y="52" textAnchor="middle" className="num" fill="#f4f5f7" fontSize="20" fontWeight="700" fontFamily="var(--font-syne)">{display ?? Math.round(v * 100)}</text>
      </svg>
      {label && <span className="text-xs font-semibold text-muted">{label}</span>}
    </div>
  );
}

export function Slider({ label, value, min, max, step = 1, unit = "", onChange, hint }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void; hint?: string }) {
  const id = useId();
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold">{label}</label>
        <span className="num text-sm font-bold text-accent">{Number.isInteger(step) ? value : value.toFixed(1)}{unit}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} style={{ ["--fill" as string]: `${((value - min) / (max - min)) * 100}%` }} onChange={(e) => onChange(+e.target.value)} />
      {hint && <p className="-mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`card p-5 sm:p-6 ${className}`}>{children}</section>;
}

export function Metric({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-semibold text-muted">{label}</div>
      <div className="num display mt-1 truncate text-2xl font-bold sm:text-3xl" style={tone ? { color: tone } : undefined}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

/** true while the element is on screen, used to pause WebGL loops off-screen */
export function useInView<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [vis, setVis] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setVis(e.isIntersecting), { rootMargin: "120px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, vis];
}

interface ChartProps {
  ks: number[];
  bands: Band[];
  today: number;
  color?: string;
  fmt?: (v: number) => string;
  yMin?: number;
  yMax?: number;
  compare?: Band[];
  compareLabel?: string;
  label: string;
  height?: number;
}
export function BandChart({ ks, bands, today, color = "#ff4a2b", fmt = (v) => v.toFixed(0), yMin, yMax, compare, compareLabel = "Nothing changes", label }: ChartProps) {
  const W = 640, H = 240, L = 46, R = 14, T = 16, B = 28;
  const [hover, setHover] = useState<number | null>(null);
  const all = [...bands, ...(compare ?? [])].flatMap((b) => [b[0], b[2]]);
  let lo = yMin ?? Math.min(...all), hi = yMax ?? Math.max(...all);
  if (hi - lo < 1e-9) hi = lo + 1;
  const pad = (hi - lo) * 0.06;
  if (yMin === undefined) lo -= pad;
  if (yMax === undefined) hi += pad;
  const x = (k: number) => L + (k / 270) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const line = (bs: Band[]) => bs.map((b, i) => `${i ? "L" : "M"}${x(ks[i]).toFixed(1)},${y(b[1]).toFixed(1)}`).join("");
  const area = `${bands.map((b, i) => `${i ? "L" : "M"}${x(ks[i]).toFixed(1)},${y(b[2]).toFixed(1)}`).join("")}${[...bands].reverse().map((b, i) => `L${x(ks[bands.length - 1 - i]).toFixed(1)},${y(b[0]).toFixed(1)}`).join("")}Z`;
  const ticks = [0, 1, 2, 3].map((i) => lo + ((hi - lo) * i) / 3);
  const gid = useId().replace(/:/g, "");

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const k = ((px - L) / (W - L - R)) * 270;
    let best = 0;
    ks.forEach((kk, i) => { if (Math.abs(kk - k) < Math.abs(ks[best] - k)) best = i; });
    setHover(best);
  };

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none" role="img" aria-label={`${label} forecast, P5 to P95 band`} style={{ touchAction: "pan-y" }} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".32" /><stop offset="1" stopColor={color} stopOpacity=".04" /></linearGradient>
        </defs>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.07)" />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#8c919e" className="num">{fmt(t)}</text>
          </g>
        ))}
        {[0, 90, 180, 270].map((k) => (<text key={k} x={x(k)} y={H - 8} textAnchor={k === 0 ? "start" : k === 270 ? "end" : "middle"} fontSize="11" fill="#8c919e" className="num">Day {k}</text>))}
        <path d={area} fill={`url(#${gid})`} />
        {compare && <path d={line(compare)} fill="none" stroke="#8c919e" strokeWidth="1.8" strokeDasharray="5 5" />}
        <path d={line(bands)} fill="none" stroke={color} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
        <line x1={x(today)} x2={x(today)} y1={T} y2={H - B} stroke="#f4f5f7" strokeOpacity=".5" strokeDasharray="3 4" />
        <text x={x(today)} y={T - 4} textAnchor="middle" fontSize="10.5" fill="#f4f5f7" fillOpacity=".7">Today</text>
        {hover !== null && (
          <g>
            <line x1={x(ks[hover])} x2={x(ks[hover])} y1={T} y2={H - B} stroke={color} strokeOpacity=".6" />
            <circle cx={x(ks[hover])} cy={y(bands[hover][1])} r="5" fill="#fff" stroke={color} strokeWidth="3" />
          </g>
        )}
      </svg>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5"><i className="inline-block h-2 w-5 rounded-full" style={{ background: color }} />Median, shaded P5 to P95</span>
          {compare && <span className="flex items-center gap-1.5"><i className="inline-block h-0 w-5 border-t-2 border-dashed border-muted" />{compareLabel}</span>}
        </span>
        <span className="num min-h-4 font-semibold text-ink">
          {hover !== null ? `Day ${ks[hover]}: ${fmt(bands[hover][1])} (${fmt(bands[hover][0])} to ${fmt(bands[hover][2])})` : ""}
        </span>
      </div>
    </div>
  );
}
