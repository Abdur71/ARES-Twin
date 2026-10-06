"use client";

import { AlertOctagon, AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from "lucide-react";
import { STATUS } from "@/lib/theme";

const STATUS_ICON = { GREEN: CheckCircle2, AMBER: AlertTriangle, RED: XCircle };

export function StatusPill({ status, size = "sm" }) {
  const s = STATUS[status] || STATUS.AMBER;
  const Icon = STATUS_ICON[status] || AlertTriangle;
  const pad = size === "lg" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-[11px]";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border font-mono font-semibold tracking-wider ${pad} ${s.bg} ${s.border} ${s.text}`}>
      <Icon className={size === "lg" ? "h-4 w-4" : "h-3 w-3"} aria-hidden />
      {status}
    </span>
  );
}

export function Panel({ title, subtitle, icon: Icon, actions, children, className = "" }) {
  return (
    <section className={`technical-panel rounded-xl p-4 sm:p-5 ${className}`}>
      {(title || actions) && (
        <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-widest text-slate-300">
              {Icon && <Icon className="h-4 w-4 shrink-0 text-cyan-400" aria-hidden />}
              {title}
            </h2>
            {subtitle && <p className="mt-1 text-xs text-slate-400">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, className = "" }) {
  return (
    <div className={`rounded-lg border border-slate-800/80 bg-slate-900/40 p-3 ${className}`}>
      <div className="font-mono text-[11px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-0.5 text-lg font-semibold text-slate-100 tabular-nums">{value}</div>
      {hint && <div className="text-[11px] text-slate-400">{hint}</div>}
    </div>
  );
}

export function Loading({ label = "Running simulation…" }) {
  return (
    <div className="flex items-center gap-2 py-10 justify-center font-mono text-xs text-cyan-300">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {label}
    </div>
  );
}

export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return (
    <div role="alert" className="rounded-lg border border-rose-800/50 bg-rose-950/40 p-3 text-xs text-rose-200">
      <div className="flex items-start gap-2">
        <AlertOctagon className="h-4 w-4 shrink-0 text-rose-400" aria-hidden />
        <div className="flex-1">
          <p className="font-semibold">Could not reach the ARES Twin backend.</p>
          <p className="mt-1 text-rose-300/80">{error.message}</p>
          <p className="mt-1 text-rose-300/80">Start it with: <code>uvicorn app.main:app --reload --port 8000</code></p>
        </div>
        {onRetry && (
          <button onClick={onRetry} className="rounded border border-rose-700 px-2 py-1 hover:bg-rose-900/50">Retry</button>
        )}
      </div>
    </div>
  );
}

const ALERT_STYLE = {
  critical: { icon: XCircle, cls: "border-rose-700/50 bg-rose-950/30 text-rose-200", label: "Critical" },
  warning: { icon: AlertTriangle, cls: "border-amber-700/40 bg-amber-950/20 text-amber-100", label: "Warning" },
  info: { icon: Info, cls: "border-sky-800/40 bg-sky-950/20 text-sky-100", label: "Info" },
};

export function AlertsList({ alerts, empty = "No active alerts." }) {
  if (!alerts?.length) return <p className="text-xs text-slate-400">{empty}</p>;
  return (
    <ul className="space-y-2">
      {alerts.map((a, i) => {
        const s = ALERT_STYLE[a.level] || ALERT_STYLE.info;
        const Icon = s.icon;
        return (
          <li key={i} className={`flex items-start gap-2 rounded-lg border p-2.5 text-xs ${s.cls}`}>
            <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span><span className="sr-only">{s.label}: </span>{a.text}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function SimulatedNote({ className = "" }) {
  return (
    <p className={`font-mono text-[11px] text-amber-300/80 ${className}`}>
      SIMULATED ASTRONAUT · real NASA/NOAA space weather · not a medical device
    </p>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-300">
      <input type="checkbox" className="h-3.5 w-3.5 accent-cyan-500" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
