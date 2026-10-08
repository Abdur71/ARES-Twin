/**
 * ARES Twin: in-browser simulation engine.
 * A TypeScript port of the first-order equations in the project README, so the UI
 * runs standalone. Swap `lib/api.ts` in later to read results from the FastAPI backend.
 * All astronauts are simulated. Space-weather events below are illustrative samples.
 */

export const MISSION_DAYS = 270;
export const MISSION_START = Date.UTC(2024, 0, 1);
export const CAREER_LIMIT = 600; // mSv
export const MIN_PER_AU = 8.317; // light travel time per AU

export type Status = "GREEN" | "AMBER" | "RED";
export type Scale = "S1" | "S2" | "S3" | "S4" | "S5";
export type Gcr = "design" | "measured";
export type Band = [number, number, number]; // p5, p50, p95

export interface Crew {
  id: string;
  name: string;
  role: string;
  hipRate: number; // % per month
  sens: number; // muscle sensitivity multiplier
  priorDose: number; // mSv
  adherence: number;
  sleep: number;
  seed: number;
  note: string;
}

export const CREW: Crew[] = [
  { id: "rahman", name: "CDR Rahman", role: "Commander", hipRate: 1.2, sens: 1.0, priorDose: 90, adherence: 0.95, sleep: 6.8, seed: 11, note: "Steady routine, high adherence" },
  { id: "okafor", name: "Dr. Okafor", role: "Medical Officer", hipRate: 1.0, sens: 0.85, priorDose: 0, adherence: 0.9, sleep: 7.0, seed: 23, note: "Lowest bone loss, first mission" },
  { id: "silva", name: "Eng. Silva", role: "Flight Engineer", hipRate: 1.5, sens: 1.2, priorDose: 150, adherence: 0.75, sleep: 6.3, seed: 37, note: "Wrist sprain, highest muscle sensitivity" },
  { id: "tanaka", name: "Sci. Tanaka", role: "Science Specialist", hipRate: 1.3, sens: 1.0, priorDose: 40, adherence: 0.85, sleep: 6.6, seed: 53, note: "Average profile, busy science schedule" },
];

export const getCrew = (id: string) => CREW.find((c) => c.id === id);

/* ---------- random ---------- */
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(r: () => number) {
  let u = 0;
  while (u === 0) u = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

/* ---------- daily logs (deterministic per astronaut) ---------- */
export interface Logs { res: Float32Array; car: Float32Array; sleep: Float32Array }
export const LOG_EVENTS = [
  { start: 60, end: 80, label: "Wrist sprain, no resistance work", only: "silva" },
  { start: 150, end: 154, label: "Resistance device down, whole crew" },
  { start: 200, end: 206, label: "Busy operations week, 5 h nights" },
];
const logCache = new Map<string, Logs>();
export function getLogs(c: Crew): Logs {
  const hit = logCache.get(c.id);
  if (hit) return hit;
  const r = mulberry32(c.seed);
  const sick = new Set<number>();
  for (let m = 0; m < 9; m++) {
    const n = 2 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) sick.add(m * 30 + Math.floor(r() * 30));
  }
  const res = new Float32Array(MISSION_DAYS), car = new Float32Array(MISSION_DAYS), sleep = new Float32Array(MISSION_DAYS);
  for (let d = 0; d < MISSION_DAYS; d++) {
    const s = sick.has(d);
    res[d] = s ? 0 : r() < c.adherence ? 1 : r() < 0.5 ? 0.5 : 0;
    car[d] = s ? 0 : r() < c.adherence + 0.03 ? 1 : 0.5;
    sleep[d] = Math.min(9, Math.max(4, c.sleep + 0.5 * gauss(r)));
  }
  for (const e of LOG_EVENTS) {
    if (e.only && e.only !== c.id) continue;
    for (let d = e.start; d <= e.end; d++) {
      if (e.label.startsWith("Busy")) sleep[d] = 5; else res[d] = 0;
    }
  }
  const out = { res, car, sleep };
  logCache.set(c.id, out);
  return out;
}

/* ---------- space weather (sample data) ---------- */
export interface SolarEvent { day: number; scale: Scale; flux: number }
export const DOSE_MAP: Record<Scale, number> = { S1: 0.5, S2: 2, S3: 10, S4: 50, S5: 200 };
export const FLUX_MIN: Record<Scale, number> = { S1: 10, S2: 100, S3: 1000, S4: 10000, S5: 100000 };
export const EVENTS: SolarEvent[] = [
  { day: 42, scale: "S1", flux: 23 }, { day: 83, scale: "S1", flux: 15 }, { day: 108, scale: "S1", flux: 34 },
  { day: 131, scale: "S3", flux: 1450 }, { day: 134, scale: "S2", flux: 210 }, { day: 162, scale: "S1", flux: 18 },
  { day: 197, scale: "S2", flux: 130 }, { day: 236, scale: "S1", flux: 12 }, { day: 262, scale: "S1", flux: 27 },
];
export interface Storm { day: number; scale: Scale; sheltered: boolean }
const S_SHELTER = 0.2;
const sheltered = (s: Scale) => s !== "S1";

/* ---------- trajectory ---------- */
const A = 1.26, E = 0.206; // perihelion 1.00 AU, aphelion 1.52 AU
const MARS_R = 1.524;
const MARS_A0 = Math.PI - (2 * Math.PI * MISSION_DAYS) / 687;
export function shipState(day: number) {
  const t = Math.min(1, Math.max(0, day / MISSION_DAYS));
  const M = Math.PI * t;
  let Ec = M;
  for (let i = 0; i < 8; i++) Ec -= (Ec - E * Math.sin(Ec) - M) / (1 - E * Math.cos(Ec));
  const x = A * (Math.cos(Ec) - E), y = A * Math.sqrt(1 - E * E) * Math.sin(Ec);
  return { x, y, r: Math.hypot(x, y) };
}
export const earthPos = (day: number) => { const a = (2 * Math.PI * day) / 365.25; return { x: Math.cos(a), y: Math.sin(a) }; };
export const marsPos = (day: number) => { const a = MARS_A0 + (2 * Math.PI * day) / 687; return { x: MARS_R * Math.cos(a), y: MARS_R * Math.sin(a) }; };
export function missionInfo(day: number) {
  const s = shipState(day), e = earthPos(day);
  const dist = Math.hypot(s.x - e.x, s.y - e.y);
  return { day, date: new Date(MISSION_START + day * 864e5), rSun: s.r, earthDist: dist, delayMin: dist * MIN_PER_AU, remaining: MISSION_DAYS - day };
}
export const fmtDate = (day: number) =>
  new Date(MISSION_START + day * 864e5).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/* ---------- radiation ---------- */
export interface Radiation { cum: Float32Array; daily: Float32Array; atToday: number; atArrival: number; endOfMission: number; gcrRate: number }
export function radiation(c: Crew, today: number, gcr: Gcr, storm: Storm | null): Radiation {
  const gcrRate = gcr === "design" ? 1.3 : 1.84;
  const daily = new Float32Array(MISSION_DAYS), cum = new Float32Array(MISSION_DAYS + 1);
  cum[0] = c.priorDose;
  for (let d = 0; d < MISSION_DAYS; d++) {
    const r = shipState(d + 0.5).r;
    let spe = 0;
    for (const e of EVENTS) if (e.day === d) spe += DOSE_MAP[e.scale] * (sheltered(e.scale) ? S_SHELTER : 1);
    if (storm && storm.day === d) spe += DOSE_MAP[storm.scale] * (storm.sheltered ? S_SHELTER : 1);
    daily[d] = gcrRate + (spe / (r * r));
    cum[d + 1] = cum[d] + daily[d];
  }
  const surface = gcr === "design" ? 0.8 : 0.64;
  return { cum, daily, atToday: cum[today], atArrival: cum[MISSION_DAYS], endOfMission: cum[MISSION_DAYS] + 500 * surface + MISSION_DAYS * gcrRate, gcrRate };
}

/* ---------- readiness ---------- */
export function scoreOf(boneLoss: number, musLoss: number, vo2Loss: number) {
  const sb = Math.max(0, 1 - (boneLoss / 0.2) ** 2);
  const sm = Math.max(0, 1 - (musLoss / 0.5) ** 2);
  const sc = Math.max(0, 1 - (vo2Loss / 0.4) ** 2);
  return { sb, sm, sc, readiness: 100 * (0.35 * sb + 0.35 * sm + 0.3 * sc) };
}
export function statusOf(readiness: number, subs: number[]): Status {
  let s: Status = readiness >= 70 ? "GREEN" : readiness >= 50 ? "AMBER" : "RED";
  if (s === "GREEN" && Math.min(...subs) < 0.4) s = "AMBER";
  return s;
}

/* ---------- Monte Carlo ---------- */
export interface Plan {
  resDays: number; cardioMin: number; sleep: number; adherence: number;
  injury: { start: number; end: number } | null; storm: Storm | null; gcr: Gcr;
}
export const basePlan = (c: Crew): Plan => ({ resDays: 7, cardioMin: 60, sleep: c.sleep, adherence: c.adherence, injury: null, storm: null, gcr: "design" });

const MAX_RUNS = 200;
interface Table { kb: Float32Array; ms: Float32Array; mc: Float32Array; u: Float32Array }
const tables = new Map<string, Table>();
function table(c: Crew): Table {
  const hit = tables.get(c.id);
  if (hit) return hit;
  const r = mulberry32(c.seed * 1000 + 7);
  const kb = new Float32Array(MAX_RUNS), ms = new Float32Array(MAX_RUNS), mc = new Float32Array(MAX_RUNS), u = new Float32Array(MAX_RUNS * MISSION_DAYS);
  for (let i = 0; i < MAX_RUNS; i++) {
    kb[i] = c.hipRate * Math.exp(0.12 * gauss(r));
    ms[i] = c.sens * Math.exp(0.08 * gauss(r));
    mc[i] = Math.exp(0.1 * gauss(r));
  }
  for (let i = 0; i < u.length; i++) u[i] = r();
  const t = { kb, ms, mc, u };
  tables.set(c.id, t);
  return t;
}

const pick = (s: Float32Array, p: number) => s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
const band = (s: Float32Array): Band => [pick(s, 0.05), pick(s, 0.5), pick(s, 0.95)];

export interface Series { k: number[]; readiness: Band[]; bone: Band[]; muscle: Band[]; vo2: Band[] }
export interface Arrival {
  readiness: Band; bone: Band; muscle: Band; vo2: Band; // losses as fractions
  subs: { bone: number; muscle: number; cardio: number };
  status: Status; pGreen: number; sorted: Float32Array;
}
export interface SimResult { series: Series | null; arrival: Arrival; at: { bone: number; muscle: number; vo2: number; readiness: number } }

export function simulate(c: Crew, today: number, plan: Plan, opts: { N?: number; series?: boolean } = {}): SimResult {
  const N = Math.min(MAX_RUNS, opts.N ?? 200), T = MISSION_DAYS;
  const lg = getLogs(c), { kb, ms, mc, u } = table(c);
  const bone = new Float32Array(N).fill(1), mus = new Float32Array(N).fill(1), vo = new Float32Array(N).fill(1);
  const ks = new Set<number>([0, today, T]);
  if (opts.series) for (let k = 5; k < T; k += 5) ks.add(k);
  const sampleAt = [...ks].sort((a, b) => a - b);
  const series: Series = { k: [], readiness: [], bone: [], muscle: [], vo2: [] };
  const rd = new Float32Array(N), bl = new Float32Array(N), ml = new Float32Array(N), vl = new Float32Array(N);
  let atToday = { bone: 0, muscle: 0, vo2: 0, readiness: 100 };

  const snapshot = (k: number, keep: boolean) => {
    let green = 0;
    for (let i = 0; i < N; i++) {
      bl[i] = 1 - bone[i]; ml[i] = 1 - mus[i]; vl[i] = 1 - vo[i];
      const s = scoreOf(bl[i], ml[i], vl[i]);
      rd[i] = s.readiness;
      if (statusOf(s.readiness, [s.sb, s.sm, s.sc]) === "GREEN") green++;
    }
    const sr = rd.slice().sort(), sb = bl.slice().sort(), sm = ml.slice().sort(), sv = vl.slice().sort();
    if (keep) {
      series.k.push(k); series.readiness.push(band(sr)); series.bone.push(band(sb)); series.muscle.push(band(sm)); series.vo2.push(band(sv));
    }
    if (k === today) atToday = { bone: pick(sb, 0.5), muscle: pick(sm, 0.5), vo2: pick(sv, 0.5), readiness: pick(sr, 0.5) };
    return { sr, sb, sm, sv, green };
  };

  let si = 0;
  if (sampleAt[0] === 0) { snapshot(0, !!opts.series); si = 1; }
  for (let d = 0; d < T; d++) {
    const inj = plan.injury && d >= plan.injury.start && d <= plan.injury.end;
    const resDay = d % 7 < plan.resDays;
    for (let i = 0; i < N; i++) {
      let cres: number, ccar: number, sl: number;
      if (d < today) { cres = lg.res[d]; ccar = lg.car[d]; sl = lg.sleep[d]; }
      else {
        const done = u[i * T + d] < plan.adherence;
        cres = resDay && done && !inj ? 1 : 0;
        ccar = done ? plan.cardioMin / 60 : 0;
        sl = plan.sleep;
      }
      bone[i] *= 1 - (kb[i] / 100 / 30) * (1 + 0.5 * (1 - cres));
      mus[i] *= 1 - ms[i] * (cres * 0.00075 * (sl < 6 ? 1.2 : 1) + (1 - cres) * 0.0025);
      vo[i] -= 0.00661 * mc[i] * (1 - 0.7 * ccar) * (vo[i] - 0.6);
    }
    while (si < sampleAt.length && sampleAt[si] === d + 1) {
      const k = sampleAt[si++];
      const snap = snapshot(k, !!opts.series);
      if (k === T) return finish(snap, N, series, opts.series ?? false, atToday);
    }
  }
  return finish(snapshot(T, false), N, series, opts.series ?? false, atToday);
}

function finish(snap: { sr: Float32Array; sb: Float32Array; sm: Float32Array; sv: Float32Array; green: number }, N: number, series: Series, keep: boolean, at: SimResult["at"]): SimResult {
  const b = band(snap.sb), m = band(snap.sm), v = band(snap.sv), r = band(snap.sr);
  const s = scoreOf(b[1], m[1], v[1]);
  return {
    series: keep ? series : null,
    at,
    arrival: { readiness: r, bone: b, muscle: m, vo2: v, subs: { bone: s.sb, muscle: s.sm, cardio: s.sc }, status: statusOf(r[1], [s.sb, s.sm, s.sc]), pGreen: snap.green / N, sorted: snap.sr },
  };
}

export const probAtLeast = (sorted: Float32Array, goal: number) => {
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < goal) lo = m + 1; else hi = m; }
  return (sorted.length - lo) / sorted.length;
};

/* ---------- optimizer ---------- */
export interface PlanResult { resDays: number; cardioMin: number; minutes: number; prob: number; p10: number; median: number }
export function optimize(c: Crew, today: number, goal: number, confidence: number, usual: boolean) {
  const plans: PlanResult[] = [];
  for (let rdays = 0; rdays <= 7; rdays++) {
    for (let cm = 0; cm <= 60; cm += 10) {
      const p: Plan = { ...basePlan(c), resDays: rdays, cardioMin: cm, adherence: usual ? c.adherence : 1 };
      const r = simulate(c, today, p, { N: 150 });
      plans.push({ resDays: rdays, cardioMin: cm, minutes: rdays * 60 + cm * 7, prob: probAtLeast(r.arrival.sorted, goal), p10: pick(r.arrival.sorted, 0.1), median: r.arrival.readiness[1] });
    }
  }
  const ok = plans.filter((p) => p.prob >= confidence).sort((a, b) => a.minutes - b.minutes || b.prob - a.prob);
  const best = ok[0] ?? [...plans].sort((a, b) => b.prob - a.prob || a.minutes - b.minutes)[0];
  return { plans, best, met: ok.length > 0 };
}

/* ---------- formatting ---------- */
export const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
export const statusColor: Record<Status, string> = { GREEN: "#35d6a0", AMBER: "#ffb23e", RED: "#ff4d4f" };
export const statusLabel: Record<Status, string> = { GREEN: "Ready", AMBER: "Watch", RED: "At risk" };

/* ---------- helpers for pages ---------- */
/** Dose inside the hull for a solar event at the ship's distance that day (mSv). */
export const eventDose = (e: SolarEvent) => {
  const r = shipState(e.day + 0.5).r;
  return (DOSE_MAP[e.scale] * (sheltered(e.scale) ? S_SHELTER : 1)) / (r * r);
};
export const isSheltered = sheltered;
export const SAMPLE_KS = Array.from({ length: 55 }, (_, i) => i * 5).concat([270]).filter((k, i, a) => a.indexOf(k) === i);
