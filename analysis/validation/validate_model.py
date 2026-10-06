"""ARES Twin model validation + sensitivity analysis.

Run from the repo root with the backend environment:

    backend/.venv/Scripts/python analysis/validation/validate_model.py      (Windows)
    backend/.venv/bin/python analysis/validation/validate_model.py          (macOS / Linux)

Writes analysis/reports/validation_report.md. The analysis imports the
backend engine; the backend never imports anything from analysis/.
"""
import sys
from contextlib import contextmanager
from datetime import date
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.simulation import params as P  # noqa: E402
from app.simulation.simulate import DailyInputs, Rates, arrival_summary, run_mission  # noqa: E402

DAYS = P.MISSION_DAYS


def inputs(c: float, days: int = DAYS, sleep: float = 7.0) -> DailyInputs:
    return DailyInputs(np.full(days, c), np.full(days, c), np.full(days, sleep), np.full(days, 1.3),
                       np.zeros(days), np.zeros(days, dtype=bool))


def mid_rates(r_bone: float = P.R_BONE_HIP_POP_MEAN) -> Rates:
    return Rates(np.array([r_bone]), np.array([1.0]), np.array([1.0]))


def run(c: float, days: int = DAYS, r_bone: float = P.R_BONE_HIP_POP_MEAN) -> dict:
    return arrival_summary(run_mission(mid_rates(r_bone), inputs(c, days)))


@contextmanager
def patched(name: str, factor: float):
    """Scale one parameter by `factor`; recalibrate λ when a cardio term changes (λ is fitted to the ISS −12 %)."""
    old = getattr(P, name)
    old_lambda = P.LAMBDA_CARDIO
    setattr(P, name, old * factor)
    if name in ("V_FLOOR_FRAC", "CARDIO_EX_EFFECT"):
        P.LAMBDA_CARDIO = P.calibrate_lambda()
    try:
        yield
    finally:
        setattr(P, name, old)
        P.LAMBDA_CARDIO = old_lambda


CHECKS = [
    # (description, published range, value function)
    ("Hip BMD loss, 6 months full exercise", (6.0, 9.0), lambda: run(1.0, 180)["loss"]["bone"]["p50"] * 100),
    ("Calf/leg muscle loss, 6 months full exercise", (12.0, 14.0), lambda: run(1.0, 180)["loss"]["muscle"]["p50"] * 100),
    ("VO2peak loss, 6 months full exercise", (10.0, 15.0), lambda: run(1.0, 180)["loss"]["cardio"]["p50"] * 100),
    ("Hip BMD loss, 9-month transit full exercise", (9.0, 13.5), lambda: run(1.0)["loss"]["bone"]["p50"] * 100),
    ("Leg muscle loss, 9 months no exercise (ESA: up to 50 %)", (40.0, 52.0),
     lambda: run(0.0)["loss"]["muscle"]["p50"] * 100),
    ("Bed-rest-like muscle loss, 105 days no exercise", (18.0, 30.0),
     lambda: run(0.0, 105)["loss"]["muscle"]["p50"] * 100),
    ("Transit GCR dose, design goal (mSv)", (350.0, 352.0),
     lambda: float(run_mission(mid_rates(), inputs(1.0))["dose"][-1])),
]

SENSITIVITY = [
    ("K_BONE", "k_bone (extra bone loss without exercise)"),
    ("R_MUSCLE_NONE", "r_none (muscle loss without exercise)"),
    ("R_MUSCLE_EX", "r_ex (muscle loss with exercise)"),
    ("V_FLOOR_FRAC", "V_floor (VO2 floor)"),
    ("CARDIO_EX_EFFECT", "cardio exercise effect (0.7)"),
    ("SLEEP_PENALTY", "sleep penalty (1.2) — only acts on nights < 6 h; reference case sleeps 7 h"),
]


def main() -> None:
    lines = [f"# ARES Twin — validation report\n\nGenerated {date.today().isoformat()} by "
             "`analysis/validation/validate_model.py`.\n",
             "## 1. Reproducing published numbers\n",
             "| Check | Published range | Model | Result |", "|---|---|---|---|"]
    failures = 0
    for desc, (lo, hi), fn in CHECKS:
        v = fn()
        ok = lo <= v <= hi
        failures += not ok
        lines.append(f"| {desc} | {lo:g}–{hi:g} | {v:.1f} | {'PASS' if ok else 'FAIL'} |")

    lines += ["\n## 2. Reference scenarios (270-day transit, mid-range rates)\n",
              "| Exercise compliance | Hip bone loss | Leg muscle loss | VO2 loss | Readiness | Status |",
              "|---|---|---|---|---|---|"]
    for c in (1.0, 0.75, 0.5, 0.25, 0.0):
        a = run(c)
        lines.append(f"| {c:.0%} | {a['loss']['bone']['p50']:.1%} | {a['loss']['muscle']['p50']:.1%} | "
                     f"{a['loss']['cardio']['p50']:.1%} | {a['readiness']['p50']:.0f} | {a['status']} |")

    lines += ["\n## 3. Sensitivity: each assumption ±25 %\n",
              "Arrival readiness at 75 % compliance (where every term matters), baseline "
              f"{run(0.75)['readiness']['p50']:.1f}.\n",
              "| Assumption | −25 % | +25 % | Swing |", "|---|---|---|---|"]
    base = run(0.75)["readiness"]["p50"]
    rows = []
    for name, label in SENSITIVITY:
        with patched(name, 0.75):
            lo = run(0.75, 270)["readiness"]["p50"]
        with patched(name, 1.25):
            hi = run(0.75, 270)["readiness"]["p50"]
        rows.append((abs(hi - lo), label, lo - base, hi - base))
    for swing, label, dlo, dhi in sorted(rows, reverse=True):
        lines.append(f"| {label} | {dlo:+.1f} | {dhi:+.1f} | {swing:.1f} |")
    lines.append(f"\nMost influential assumption: **{sorted(rows, reverse=True)[0][1]}**.\n")

    out = ROOT / "analysis" / "reports" / "validation_report.md"
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    print(f"\nWrote {out.relative_to(ROOT)} — {len(CHECKS) - failures}/{len(CHECKS)} checks passed.")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
