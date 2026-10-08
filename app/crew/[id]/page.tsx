"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useMission } from "@/lib/mission";
import {
  CAREER_LIMIT, EVENTS, LOG_EVENTS, MISSION_DAYS, SAMPLE_KS, basePlan, fmtDate, getCrew, pct, radiation, scoreOf, simulate, statusColor, statusOf,
  type Band, type Gcr, type Status,
} from "@/lib/engine";
import { BandChart, Card, Gauge, Metric, StatusPill } from "@/components/ui";
import BodyTwin from "@/components/BodyTwin";
import { AstronautViewer } from "@/components/Scene3D";
import { IconBack } from "@/components/icons";

type Sys = "bone" | "muscle" | "vo2";
const SYS_LABEL: Record<Sys, string> = { bone: "Hip bone density", muscle: "Leg muscle volume", vo2: "Aerobic fitness (VO2peak)" };

export default function CrewPage() {
  const { id } = useParams<{ id: string }>();
  const { day } = useMission();
  const c = getCrew(id);
  const [gcr, setGcr] = useState<Gcr>("design");
  const [view, setView] = useState<"today" | "arrival">("arrival");
  const [chk, setChk] = useState<{ sys: Sys; val: string; day: string }>({ sys: "bone", val: "", day: "" });

  const data = useMemo(() => {
    if (!c) return null;
    const sim = simulate(c, day, { ...basePlan(c), gcr }, { series: true });
    return { sim, rad: radiation(c, day, gcr, null) };
  }, [c, day, gcr]);

  if (!c || !data) {
    return (
      <Card><p className="mb-4">No crew member with id "{id}".</p><Link href="/" className="btn">Back to mission</Link></Card>
    );
  }
  const { sim, rad } = data, a = sim.arrival, ser = sim.series!;
  const col = statusColor[a.status];
  const now = scoreOf(sim.at.bone, sim.at.muscle, sim.at.vo2);
  const nowStatus = statusOf(now.readiness, [now.sb, now.sm, now.sc]);
  const shown = view === "arrival"
    ? { bone: { score: a.subs.bone, loss: a.bone[1] }, muscle: { score: a.subs.muscle, loss: a.muscle[1] }, cardio: { score: a.subs.cardio, loss: a.vo2[1] } }
    : { bone: { score: now.sb, loss: sim.at.bone }, muscle: { score: now.sm, loss: sim.at.muscle }, cardio: { score: now.sc, loss: sim.at.vo2 } };

  const pctBands = (b: Band[]): Band[] => b.map((x) => [x[0] * 100, x[1] * 100, x[2] * 100]);
  const doseBands: Band[] = SAMPLE_KS.map((k) => [rad.cum[k], rad.cum[k], rad.cum[k]]);

  // alerts
  const alerts: { tone: Status; text: string }[] = [];
  if (a.status === "GREEN") alerts.push({ tone: "GREEN", text: `On track. Median arrival readiness is ${a.readiness[1].toFixed(0)} with a ${(a.pGreen * 100).toFixed(0)}% chance of staying Ready.` });
  else alerts.push({ tone: a.status, text: `Median arrival readiness is ${a.readiness[1].toFixed(0)}, ${a.status === "RED" ? "below 50" : "under the 70 line"}. The optimizer can find the cheapest plan that recovers it.` });
  const weakest = (Object.entries({ "Hip bone": a.subs.bone, "Leg muscle": a.subs.muscle, "Aerobic fitness": a.subs.cardio }) as [string, number][]).sort((x, y) => x[1] - y[1])[0];
  if (weakest[1] < 0.7) alerts.push({ tone: weakest[1] < 0.4 ? "RED" : "AMBER", text: `${weakest[0]} is the weakest system, scoring ${(weakest[1] * 100).toFixed(0)} of 100 on arrival.` });
  if (c.adherence < 0.8) alerts.push({ tone: "AMBER", text: `Exercise adherence is ${(c.adherence * 100).toFixed(0)}%. Each skipped resistance day adds extra muscle and bone loss.` });
  if (rad.atArrival > CAREER_LIMIT * 0.7) alerts.push({ tone: rad.atArrival > CAREER_LIMIT ? "RED" : "AMBER", text: `Career dose reaches ${rad.atArrival.toFixed(0)} mSv on arrival, ${((rad.atArrival / CAREER_LIMIT) * 100).toFixed(0)}% of the ${CAREER_LIMIT} mSv limit.` });
  const log = [
    ...LOG_EVENTS.filter((e) => !e.only || e.only === c.id).map((e) => ({ day: e.start, end: e.end, text: e.label })),
    ...EVENTS.map((e) => ({ day: e.day, end: e.day, text: `${e.scale} solar particle event, ${e.flux} pfu` })),
  ].sort((x, y) => x.day - y.day);
  log.filter((e) => day >= e.day && day <= e.end && e.end > e.day).forEach((e) => alerts.push({ tone: "AMBER", text: `Active now: ${e.text}.` }));

  // check-up comparison
  const chkDay = Math.max(0, Math.min(MISSION_DAYS, Number(chk.day === "" ? day : chk.day)));
  const ki = ser.k.reduce((best, k, i) => (Math.abs(k - chkDay) < Math.abs(ser.k[best] - chkDay) ? i : best), 0);
  const bandFor = (s: Sys) => (s === "bone" ? ser.bone : s === "muscle" ? ser.muscle : ser.vo2)[ki];
  const measured = chk.val === "" ? null : Number(chk.val) / 100;
  const b = bandFor(chk.sys);
  const verdict = measured === null || Number.isNaN(measured) ? null : measured < b[0] ? "below" : measured > b[2] ? "above" : "inside";

  return (
    <div className="space-y-6">
      <Link href="/" className="pill inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold"><IconBack width={16} height={16} />Mission</Link>

      <section className="card overflow-hidden">
        <div className="grid items-center lg:grid-cols-[minmax(0,380px)_1fr]">
          <div className="h-72 sm:h-96 lg:h-[420px]"><AstronautViewer tint={col} /></div>
          <div className="space-y-5 p-6 sm:p-9">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-extrabold sm:text-4xl">{c.name}</h1>
              <StatusPill status={a.status} />
            </div>
            <p className="text-sm text-muted">{c.role}. {c.note}.</p>
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
              <Metric label="Readiness on arrival" value={a.readiness[1].toFixed(0)} sub={`P5 ${a.readiness[0].toFixed(0)} to P95 ${a.readiness[2].toFixed(0)}`} tone={col} />
              <Metric label="Readiness today" value={now.readiness.toFixed(0)} sub={`Day ${day}`} tone={statusColor[nowStatus]} />
              <Metric label="Chance Ready" value={`${(a.pGreen * 100).toFixed(0)}%`} sub="on arrival day" />
              <Metric label="Dose on arrival" value={`${rad.atArrival.toFixed(0)}`} sub={`mSv of ${CAREER_LIMIT}`} />
            </div>
            <div className="flex flex-wrap gap-3 pt-1">
              <Link href={`/whatif?crew=${c.id}`} className="btn">Run a what-if</Link>
              <Link href={`/optimize?crew=${c.id}`} className="btn btn-quiet">Find cheapest plan</Link>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold">Body twin</h2>
            <div className="pill flex p-1 text-sm font-semibold" role="group" aria-label="Twin timeframe">
              {(["today", "arrival"] as const).map((v) => (
                <button key={v} onClick={() => setView(v)} aria-pressed={view === v} className={`rounded-full px-4 py-1.5 transition-colors ${view === v ? "bg-accent text-white" : "text-muted"}`}>{v === "today" ? "Today" : "On arrival"}</button>
              ))}
            </div>
          </div>
          <div className="mt-4"><BodyTwin {...shown} /></div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Gauge value={shown.bone.score} label="Bone" color={statusColor[shown.bone.score >= 0.7 ? "GREEN" : shown.bone.score >= 0.4 ? "AMBER" : "RED"]} size={84} />
            <Gauge value={shown.muscle.score} label="Muscle" color={statusColor[shown.muscle.score >= 0.7 ? "GREEN" : shown.muscle.score >= 0.4 ? "AMBER" : "RED"]} size={84} />
            <Gauge value={shown.cardio.score} label="Cardio" color={statusColor[shown.cardio.score >= 0.7 ? "GREEN" : shown.cardio.score >= 0.4 ? "AMBER" : "RED"]} size={84} />
          </div>
        </Card>

        <Card className="flex flex-col">
          <h2 className="text-xl font-bold">Alerts</h2>
          <ul className="mt-4 space-y-2.5">
            {alerts.map((al, i) => (
              <li key={i} className="card-flat flex gap-3 p-3.5 text-sm leading-relaxed">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: statusColor[al.tone] }} />{al.text}
              </li>
            ))}
          </ul>
          <h3 className="mb-2 mt-6 text-sm font-bold text-muted">Mission log</h3>
          <ul className="scroll-x max-h-56 space-y-1.5 overflow-y-auto pr-1 text-sm">
            {log.map((e, i) => (
              <li key={i} className={`flex justify-between gap-3 ${e.end < day ? "text-muted" : ""}`}>
                <span className="min-w-0">{e.text}</span><span className="num shrink-0 text-xs text-muted">{fmtDate(e.day)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <section>
        <h2 className="mb-4 text-xl font-bold">Forecast to arrival</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card><h3 className="mb-2 font-bold">Readiness</h3><BandChart label="Readiness" ks={ser.k} bands={ser.readiness} today={day} color={col} yMin={0} yMax={100} fmt={(v) => v.toFixed(0)} /></Card>
          <Card><h3 className="mb-2 font-bold">Hip bone density loss</h3><BandChart label="Bone loss" ks={ser.k} bands={pctBands(ser.bone)} today={day} color="#ffb23e" yMin={0} fmt={(v) => `${v.toFixed(1)}%`} /></Card>
          <Card><h3 className="mb-2 font-bold">Leg muscle volume loss</h3><BandChart label="Muscle loss" ks={ser.k} bands={pctBands(ser.muscle)} today={day} color="#ff4a2b" yMin={0} fmt={(v) => `${v.toFixed(1)}%`} /></Card>
          <Card><h3 className="mb-2 font-bold">Aerobic fitness (VO2peak) loss</h3><BandChart label="VO2 loss" ks={ser.k} bands={pctBands(ser.vo2)} today={day} color="#6f8cff" yMin={0} fmt={(v) => `${v.toFixed(1)}%`} /></Card>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold">Radiation budget</h2>
            <div className="pill flex p-1 text-sm font-semibold" role="group" aria-label="Galactic cosmic ray scenario">
              {(["design", "measured"] as const).map((g) => (
                <button key={g} onClick={() => setGcr(g)} aria-pressed={gcr === g} className={`rounded-full px-3.5 py-1.5 transition-colors ${gcr === g ? "bg-accent text-white" : "text-muted"}`}>{g === "design" ? "Design goal" : "Measured"}</button>
              ))}
            </div>
          </div>
          <div className="mt-5">
            <div className="relative h-4 overflow-hidden rounded-full bg-white/10">
              <div className="absolute inset-y-0 left-0 rounded-full bg-accent/40" style={{ width: `${Math.min(100, (rad.atArrival / CAREER_LIMIT) * 100)}%` }} />
              <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${Math.min(100, (rad.atToday / CAREER_LIMIT) * 100)}%` }} />
            </div>
            <div className="num mt-2 flex justify-between text-xs text-muted"><span>0</span><span>{CAREER_LIMIT} mSv career limit</span></div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-4">
            <Metric label="Used today" value={rad.atToday.toFixed(0)} sub="mSv" />
            <Metric label="On arrival" value={rad.atArrival.toFixed(0)} sub="mSv" />
            <Metric label="After round trip" value={rad.endOfMission.toFixed(0)} sub="mSv, estimate" />
          </div>
          <div className="mt-5"><BandChart label="Cumulative dose" ks={SAMPLE_KS} bands={doseBands} today={day} color="#ff4a2b" yMin={0} yMax={Math.max(CAREER_LIMIT, rad.atArrival * 1.05)} fmt={(v) => `${v.toFixed(0)}`} /></div>
        </Card>

        <Card>
          <h2 className="text-xl font-bold">Check the twin against a check-up</h2>
          <p className="mt-1 text-sm text-muted">Enter a measured loss and see whether the forecast band covered it.</p>
          <div className="mt-5 space-y-4">
            <div className="scroll-x flex gap-2" role="group" aria-label="System">
              {(Object.keys(SYS_LABEL) as Sys[]).map((s) => (
                <button key={s} onClick={() => setChk({ ...chk, sys: s })} aria-pressed={chk.sys === s} className={`pill shrink-0 px-4 py-2 text-sm font-semibold ${chk.sys === s ? "!border-accent bg-accent/15 text-ink" : "text-muted"}`}>{SYS_LABEL[s]}</button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm font-semibold">Measured loss (%)
                <input inputMode="decimal" value={chk.val} onChange={(e) => setChk({ ...chk, val: e.target.value })} placeholder="e.g. 4.2" className="card-flat mt-1.5 h-12 w-full px-4 text-base outline-none focus:border-accent" />
              </label>
              <label className="text-sm font-semibold">Mission day
                <input inputMode="numeric" value={chk.day} onChange={(e) => setChk({ ...chk, day: e.target.value })} placeholder={String(day)} className="card-flat mt-1.5 h-12 w-full px-4 text-base outline-none focus:border-accent" />
              </label>
            </div>
            <div className="card-flat p-4 text-sm leading-relaxed" aria-live="polite">
              <div className="text-muted">Twin forecast near day {ser.k[ki]}</div>
              <div className="num mt-1 text-lg font-bold">{pct(b[1])} <span className="text-sm font-medium text-muted">({pct(b[0])} to {pct(b[2])})</span></div>
              {verdict && (
                <p className="mt-2" style={{ color: verdict === "inside" ? statusColor.GREEN : statusColor.AMBER }}>
                  {verdict === "inside" ? "The measurement sits inside the P5 to P95 band, so the twin agrees." : `The measurement is ${verdict} the band. This astronaut is losing ${verdict === "above" ? "faster" : "slower"} than the twin expects.`}
                </p>
              )}
            </div>
            <p className="text-xs text-muted">With the backend connected, check-ups feed the Bayesian updater and personalise the twin.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
