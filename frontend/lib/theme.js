// Chart tokens for the dark mission-control surface (#0b1222).
// Series slots validated with the dataviz palette checker (CVD ΔE ≥ 9.4, contrast ≥ 3:1).
export const SERIES = {
  blue: "#3987e5",
  orange: "#d95926",
  aqua: "#199e70",
};

export const CHART = {
  surface: "#0b1222",
  grid: "#1c2638",
  axis: "#334155",
  tick: "#8b95a7",
  ink: "#e2e8f0",
  inkSecondary: "#b6bfcc",
};

// Status colours are reserved for state and always ship with an icon + label.
export const STATUS = {
  GREEN: { color: "#0ca30c", text: "text-emerald-300", bg: "bg-emerald-950/40", border: "border-emerald-500/40" },
  AMBER: { color: "#fab219", text: "text-amber-300", bg: "bg-amber-950/40", border: "border-amber-500/40" },
  RED: { color: "#d03b3b", text: "text-rose-300", bg: "bg-rose-950/40", border: "border-rose-500/40" },
};

export const METRICS = {
  bone: { label: "Hip bone density", short: "Bone", unit: "g/cm²", baselineKey: "hip_bmd", limit: 20 },
  muscle: { label: "Leg muscle", short: "Muscle", unit: "kg", baselineKey: "leg_lean_kg", limit: 50 },
  cardio: { label: "Aerobic fitness (VO2peak)", short: "Cardio", unit: "mL/kg/min", baselineKey: "vo2peak", limit: 40 },
};

export const CREW_TABS = [
  { id: "rahman", name: "CDR Rahman" },
  { id: "okafor", name: "Dr. Okafor" },
  { id: "silva", name: "Eng. Silva" },
  { id: "tanaka", name: "Sci. Tanaka" },
];

export const fmt = {
  pct: (x, d = 1) => `${(x * 100).toFixed(d)}%`,
  num: (x, d = 0) => (x == null || Number.isNaN(x) ? "—" : Number(x).toFixed(d)),
};
