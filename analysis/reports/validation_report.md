# ARES Twin — validation report

Generated 2026-10-07 by `analysis/validation/validate_model.py`.

## 1. Reproducing published numbers

| Check | Published range | Model | Result |
|---|---|---|---|
| Hip BMD loss, 6 months full exercise | 6–9 | 7.2 | PASS |
| Calf/leg muscle loss, 6 months full exercise | 12–14 | 12.6 | PASS |
| VO2peak loss, 6 months full exercise | 10–15 | 12.0 | PASS |
| Hip BMD loss, 9-month transit full exercise | 9–13.5 | 10.6 | PASS |
| Leg muscle loss, 9 months no exercise (ESA: up to 50 %) | 40–52 | 49.1 | PASS |
| Bed-rest-like muscle loss, 105 days no exercise | 18–30 | 23.1 | PASS |
| Transit GCR dose, design goal (mSv) | 350–352 | 351.0 | PASS |

## 2. Reference scenarios (270-day transit, mid-range rates)

| Exercise compliance | Hip bone loss | Leg muscle loss | VO2 loss | Readiness | Status |
|---|---|---|---|---|---|
| 100% | 10.6% | 18.3% | 16.6% | 80 | GREEN |
| 75% | 11.9% | 27.4% | 22.9% | 67 | AMBER |
| 50% | 13.1% | 35.5% | 27.5% | 53 | AMBER |
| 25% | 14.3% | 42.7% | 30.9% | 39 | RED |
| 0% | 15.5% | 49.1% | 33.3% | 24 | RED |

## 3. Sensitivity: each assumption ±25 %

Arrival readiness at 75 % compliance (where every term matters), baseline 67.3.

| Assumption | −25 % | +25 % | Swing |
|---|---|---|---|
| cardio exercise effect (0.7) | +2.5 | -8.0 | 10.5 |
| r_none (muscle loss without exercise) | +2.3 | -2.4 | 4.7 |
| r_ex (muscle loss with exercise) | +2.0 | -2.2 | 4.2 |
| V_floor (VO2 floor) | -1.3 | +2.5 | 3.8 |
| k_bone (extra bone loss without exercise) | +0.6 | -0.7 | 1.3 |
| sleep penalty (1.2) — only acts on nights < 6 h; reference case sleeps 7 h | +0.0 | +0.0 | 0.0 |

Most influential assumption: **cardio exercise effect (0.7)**.

