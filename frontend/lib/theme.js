// Chart tokens for the dark mission-control surface (#14161c).
// Series slots validated with the dataviz palette checker (CVD ΔE ≥ 9.4, contrast ≥ 3:1).
export const SERIES = {
  blue: "#6f8cff",
  orange: "#ff4a2b",
  aqua: "#35d6a0",
};

export const CHART = {
  surface: "#14161c",
  grid: "rgba(255, 255, 255, 0.08)",
  axis: "rgba(255, 255, 255, 0.08)",
  tick: "#8c919e",
  ink: "#f4f5f7",
  inkSecondary: "#8c919e",
};

// Status colours are reserved for state and always ship with an icon + label.
export const STATUS = {
  GREEN: { color: "#35d6a0", text: "text-go", bg: "bg-go/12", border: "border-go/40" },
  AMBER: { color: "#ffb23e", text: "text-warn", bg: "bg-warn/12", border: "border-warn/40" },
  RED: { color: "#ff4d4f", text: "text-stop", bg: "bg-stop/12", border: "border-stop/40" },
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
