import { Card } from "@/components/ui";

const EQ: [string, string, string][] = [
  ["Bone", "BMD(t+1) = BMD(t) × (1 − r_bone/30 × [1 + k_bone (1 − c_res)] × g)", "r_bone is 1.0 to 1.5% a month at the hip. k_bone = 0.5 is an assumption. g = 1 in transit."],
  ["Muscle", "M(t+1) = M(t) × (1 − m [c_res · r_ex · σ + (1 − c_res) · r_none])", "r_ex = 0.075% a day, r_none = 0.25% a day (assumption), σ = 1.2 when sleep is under 6 h."],
  ["Aerobic fitness", "V(t+1) = V(t) − λ · m_c · (1 − 0.7 · c_cardio) · (V(t) − V_floor)", "λ = 0.00661 a day gives about 12% loss in six months with full exercise. V_floor = 60% of baseline."],
  ["Radiation", "D(t+1) = D(t) + d_GCR + E_SPE × (1 AU / r)² × s_shelter", "d_GCR is 1.3 mSv a day (design goal) or 1.84 (measured). s_shelter = 0.2 when the crew reaches the shelter."],
  ["Readiness", "S_i = max(0, 1 − (loss_i / limit_i)²), Readiness = 100 × (0.35 S_bone + 0.35 S_muscle + 0.30 S_cardio)", "Limits where a score reaches zero: bone 20%, muscle 50%, VO2 40%."],
];
const PARAMS: [string, string, string][] = [
  ["Hip bone loss", "1.0 to 1.5% a month", "Measured"],
  ["Calf volume loss, full exercise", "13% in 6 months", "Measured"],
  ["VO2peak, muscle, strength loss", "10 to 15%", "Measured"],
  ["GCR dose, design goal", "1.3 / 0.8 mSv a day (transit / surface)", "NASA design goal"],
  ["GCR dose, measured", "1.84 / 0.64 mSv a day", "Measured"],
  ["Career dose limit", "600 mSv", "NASA standard"],
  ["k_bone, r_none, σ, V_floor, s_shelter, dose map", "see equations", "Assumption"],
];
const tag = (t: string) => (t === "Assumption" ? "bg-warn/15 text-warn" : "bg-go/15 text-go");

export default function About() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h1 className="text-3xl font-extrabold sm:text-4xl">About the model</h1>
        <p className="max-w-2xl text-muted">Five short equations, updated once a day, run 200 times with randomised personal rates to give the P5 to P95 bands. Compliance c is the share of the prescribed plan done that day: 60 minutes of resistance work and 60 minutes of cardio.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {EQ.map(([n, e, note]) => (
          <Card key={n}>
            <h2 className="font-bold">{n}</h2>
            <pre className="scroll-x num mt-3 whitespace-pre-wrap break-words rounded-xl bg-black/30 p-4 text-[13px] leading-relaxed text-ink">{e}</pre>
            <p className="mt-3 text-sm text-muted">{note}</p>
          </Card>
        ))}
        <Card>
          <h2 className="font-bold">Status bands</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li><b className="text-go">Ready</b> at readiness 70 or more</li>
            <li><b className="text-warn">Watch</b> from 50 to 69, and whenever any sub-score is below 0.4</li>
            <li><b className="text-stop">At risk</b> below 50</li>
          </ul>
          <p className="mt-3 text-sm text-muted">Radiation is shown as a dose budget against the 600 mSv career limit, separate from fitness.</p>
        </Card>
      </div>
      <Card>
        <h2 className="mb-3 text-lg font-bold">Parameters</h2>
        <div className="scroll-x"><table className="w-full min-w-[480px] text-sm">
          <tbody>{PARAMS.map(([a, b, t]) => (<tr key={a} className="border-t border-line first:border-0"><td className="py-3 pr-3 font-semibold">{a}</td><td className="py-3 pr-3 text-muted">{b}</td><td className="py-3 text-right"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${tag(t)}`}>{t}</span></td></tr>))}</tbody>
        </table></div>
      </Card>
      <Card>
        <h2 className="mb-3 text-lg font-bold">Limitations</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
          <li>All astronauts are simulated. No individual astronaut data is used.</li>
          <li>The models are first-order equations, not full physiology, and cover the transit only.</li>
          <li>Converting a solar event seen at Earth into a crew dose elsewhere is a simplification.</li>
          <li>ARES Twin is decision support for crew and flight surgeons. It is not a diagnostic or medical device.</li>
        </ul>
      </Card>
    </div>
  );
}
