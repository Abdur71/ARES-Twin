"""Countermeasure optimizer: brute-force search for the cheapest plan that meets a readiness goal.

All 56 plans × N runs are simulated as a single vectorised batch with common
random numbers (every plan sees the same personal-rate draws), so differences
between plans come from the plan, not from sampling noise.
"""
import numpy as np

from app.simulation import params as P
from app.simulation.scenario import Plan, Radiation, build_inputs
from app.simulation.simulate import DailyInputs, Rates, run_mission

RESISTANCE_OPTIONS = range(0, 8)
CARDIO_OPTIONS = range(0, 61, 10)


def weekly_cost(resistance_days: int, cardio_min: float) -> float:
    """Crew minutes of exercise per week."""
    return resistance_days * P.PRESCRIBED_RESISTANCE_MIN + 7 * cardio_min


def optimize(logs: dict, current_day: int, rates: Rates, radiation: Radiation, *, sleep_h: float,
             adherence: float, goal_readiness: float = 75.0, goal_probability: float = 0.9) -> dict:
    plans = [Plan(resistance_days=r, cardio_min=c, sleep_h=sleep_h, adherence=adherence)
             for r in RESISTANCE_OPTIONS for c in CARDIO_OPTIONS]
    per_plan = [build_inputs(logs, current_day, p, radiation) for p in plans]
    R = rates.runs
    batch = DailyInputs(
        c_res=np.repeat(np.stack([i.c_res for i in per_plan]), R, axis=0),
        c_cardio=np.repeat(np.stack([i.c_cardio for i in per_plan]), R, axis=0),
        sleep_h=np.repeat(np.stack([i.sleep_h for i in per_plan]), R, axis=0),
        gcr_msv=radiation.gcr_msv, spe_msv=radiation.spe_msv, sheltered=radiation.sheltered,
    )
    tiled = Rates(*(np.tile(a, len(plans)) for a in (rates.r_bone, rates.muscle_mult, rates.cardio_mult)))
    final = run_mission(tiled, batch, record=False)["readiness"].reshape(len(plans), R)

    rows = []
    for plan, scores in zip(plans, final):
        prob = float(np.mean(scores >= goal_readiness))
        rows.append({
            "resistance_days": plan.resistance_days,
            "cardio_min": plan.cardio_min,
            "weekly_minutes": weekly_cost(plan.resistance_days, plan.cardio_min),
            "readiness_p10": float(np.percentile(scores, 10)),
            "readiness_p50": float(np.median(scores)),
            "probability": prob,
            "meets_goal": prob >= goal_probability,
        })

    default_cost = weekly_cost(7, P.PRESCRIBED_CARDIO_MIN)
    feasible = sorted((r for r in rows if r["meets_goal"]), key=lambda r: (r["weekly_minutes"], -r["readiness_p50"]))
    best = feasible[0] if feasible else None
    closest = max(rows, key=lambda r: (r["probability"], r["readiness_p50"]))
    if best:
        saved = (default_cost - best["weekly_minutes"]) / 60
        message = (f"Minimum plan: {best['resistance_days']} resistance days + {best['cardio_min']:g} min cardio per day. "
                   f"Saves {saved:.1f} hours per week versus the default plan.")
    else:
        message = (f"No plan reaches readiness ≥ {goal_readiness:g} in {goal_probability:.0%} of runs. "
                   f"Best available: {closest['resistance_days']} resistance days + {closest['cardio_min']:g} min cardio "
                   f"({closest['probability']:.0%} of runs).")
    return {
        "goal": {"readiness": goal_readiness, "probability": goal_probability},
        "adherence": adherence,
        "runs_per_plan": R,
        "plans_evaluated": len(plans),
        "default_weekly_minutes": default_cost,
        "best": best,
        "closest": closest,
        "message": message,
        "grid": rows,
    }
