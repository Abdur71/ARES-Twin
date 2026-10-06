"""Glue between the database, space weather and the simulation engine."""
import zlib
from dataclasses import dataclass

import numpy as np

from app.db.models import CrewMember
from app.db.repository import logs_dict, measurement_dict, profile
from app.simulation import params as P, twin_update
from app.simulation.optimize import optimize
from app.simulation.readiness import radiation_budget
from app.simulation.scenario import Plan, Radiation, build_inputs, habit_plan
from app.simulation.simulate import DailyInputs, arrival_summary, bands, draw_rates, run_mission
from app.spaceweather.service import radiation_inputs, received_dose

LOSS_KEYS = {"bone": "bone", "muscle": "muscle", "cardio": "vo2"}


@dataclass
class Twin:
    profile: dict
    logs: dict
    measurements: list[dict]
    plan: Plan
    radiation: Radiation
    inputs: DailyInputs
    posterior: dict
    priors: dict
    result: dict
    current_day: int


def seed_for(crew_id: str) -> int:
    return zlib.crc32(crew_id.encode())


def personal_priors(prof: dict) -> dict:
    return twin_update.priors_for(prof["r_bone_hip"], P.MUSCLE_SENSITIVITY[prof["muscle_sensitivity"]])


def simulate_member(member: CrewMember, sw: dict, current_day: int, plan: Plan | None = None,
                    gcr_scenario: str = P.DEFAULT_GCR_SCENARIO, shelter_overrides: dict | None = None,
                    extra_storms: list | None = None, runs: int = P.MC_RUNS) -> Twin:
    prof = profile(member)
    logs = logs_dict(member)
    measurements = [measurement_dict(x, member) for x in member.measurements]
    plan = plan or habit_plan(prof)
    rad = radiation_inputs(sw, gcr_scenario, shelter_overrides, extra_storms)
    inputs = build_inputs(logs, current_day, plan, rad)
    priors = personal_priors(prof)
    post = twin_update.posterior(priors, measurements, inputs)
    rng = np.random.default_rng(seed_for(prof["id"]))
    rates = draw_rates(rng, runs, prof["r_bone_hip"], priors["muscle"][0], 1.0,
                       posterior=post if measurements else None)
    return Twin(prof, logs, measurements, plan, rad, inputs, post, priors, run_mission(rates, inputs), current_day)


def budget(t: Twin, gcr_scenario: str) -> dict:
    dose = t.result["dose"]
    max_event = max((received_dose(e) for e in t.radiation.events), default=0.0)
    return radiation_budget(t.profile["prior_dose_msv"], float(dose[t.current_day]), float(dose[-1]), gcr_scenario,
                            max_event)


def alerts(t: Twin, arrival: dict, rad_budget: dict) -> list[dict]:
    out = []
    r = arrival["readiness"]
    if arrival["status"] != "GREEN":
        out.append({"level": "critical" if arrival["status"] == "RED" else "warning",
                    "text": f"Arrival readiness forecast {r['p50']:.0f} ({arrival['status']})."})
    elif r["p10"] < P.GREEN_MIN:
        out.append({"level": "warning",
                    "text": f"1-in-10 chance of arriving below GREEN (P10 readiness {r['p10']:.0f})."})
    for k, s in arrival["subscores"].items():
        if s < P.SUBSCORE_CAP:
            out.append({"level": "critical", "text": f"{k.capitalize()} sub-score {s:.2f} < 0.4 — status capped at AMBER."})
    d = t.current_day
    if d >= 7:
        c_week = float(np.mean(t.inputs.c_res[d - 7:d]))
        if c_week < 0.5:
            out.append({"level": "warning", "text": f"Resistance compliance {c_week:.0%} over the last 7 days."})
        sleep_week = float(np.mean(t.inputs.sleep_h[d - 7:d]))
        if sleep_week < P.SLEEP_THRESHOLD_H:
            out.append({"level": "warning", "text": f"Average sleep {sleep_week:.1f} h over the last 7 days (< 6 h)."})
    if d < len(t.logs["events"]) and t.logs["events"][d]:
        out.append({"level": "info", "text": f"Today: {t.logs['events'][d]}."})
    if rad_budget["arrival_fraction"] >= 0.75:
        out.append({"level": "warning", "text": f"Career dose at arrival projected at {rad_budget['arrival_msv']:.0f} mSv "
                                                f"({rad_budget['arrival_fraction']:.0%} of the 600 mSv limit)."})
    if rad_budget["end_of_mission_msv"] >= P.CAREER_LIMIT_MSV:
        out.append({"level": "warning", "text": f"Full conjunction-class mission projected at "
                                                f"{rad_budget['end_of_mission_msv']:.0f} mSv — exceeds the career limit."})
    if rad_budget["max_single_event_msv"] >= P.SHORT_TERM_LIMIT:
        out.append({"level": "critical", "text": "A single solar event exceeds the 250 mGy-Eq short-term limit."})
    upcoming = [e for e in t.radiation.events if d <= e["day"] < d + 14 and e.get("s_level", 0) >= 1]
    for e in upcoming:
        out.append({"level": "info", "text": f"Solar particle event ({e['s_scale']}) on mission day {e['day']} "
                                             f"({'shelter' if e['sheltered'] else 'no shelter'})."})
    return out


def _pct(arr):
    return {k: [round(v * 100, 2) for v in vals] for k, vals in arr.items()}


def summary(t: Twin, gcr_scenario: str = P.DEFAULT_GCR_SCENARIO) -> dict:
    arrival = arrival_summary(t.result)
    today = arrival_summary(t.result, day=t.current_day)
    rb = budget(t, gcr_scenario)
    return {"profile": t.profile, "arrival": arrival, "today": today, "radiation": rb,
            "alerts": alerts(t, arrival, rb)}


def detail(t: Twin, sw: dict, gcr_scenario: str = P.DEFAULT_GCR_SCENARIO) -> dict:
    s = summary(t, gcr_scenario)
    base = t.profile["baseline"]
    today_abs = {
        "hip_bmd": round(base["hip_bmd"] * float(np.median(t.result["bone"][:, t.current_day])), 3),
        "leg_lean_kg": round(base["leg_lean_kg"] * float(np.median(t.result["muscle"][:, t.current_day])), 2),
        "vo2peak": round(base["vo2peak"] * float(np.median(t.result["vo2"][:, t.current_day])), 1),
    }
    series = {k: _pct(bands(1 - t.result[v])) for k, v in LOSS_KEYS.items()}
    series["readiness"] = {k: [round(x, 1) for x in v] for k, v in bands(t.result["readiness"]).items()}
    series["dose"] = [round(t.profile["prior_dose_msv"] + x, 1) for x in t.result["dose"]]
    timeline = [{"day": d, "label": e} for d, e in enumerate(t.logs["events"]) if e]
    rates = {m: {"prior_mean": t.priors[m][0], "prior_sd": t.priors[m][1],
                 "posterior_mean": t.posterior[m][0], "posterior_sd": t.posterior[m][1]} for m in t.priors}
    return {
        **s,
        "current_day": t.current_day,
        "today_absolute": today_abs,
        "series": series,
        "log_events": timeline,
        "radiation_events": t.radiation.events,
        "measurements": t.measurements,
        "rates": rates,
        "logs": {k: t.logs[k] for k in ("resistance_min", "cardio_min", "sleep_h")},
        "plan": t.plan.__dict__,
        "comm": sw["trajectory"][t.current_day],
    }


def compare(base: Twin, scen: Twin, base_gcr: str, scen_gcr: str) -> dict:
    """Before/after view for the what-if simulator."""
    a, b = arrival_summary(base.result), arrival_summary(scen.result)
    ra, rb = budget(base, base_gcr), budget(scen, scen_gcr)
    names = {"bone": "Hip bone loss", "muscle": "Leg muscle loss", "cardio": "VO2peak loss"}
    lines = [f"{names[k]} {a['loss'][k]['p50'] * 100:.1f}% → {b['loss'][k]['p50'] * 100:.1f}%" for k in names]
    lines.append(f"Readiness {a['readiness']['p50']:.0f} → {b['readiness']['p50']:.0f} ({a['status']} → {b['status']})")
    lines.append(f"Career dose at arrival {ra['arrival_msv']:.0f} → {rb['arrival_msv']:.0f} mSv")

    def series(t):
        return {"readiness": bands(t.result["readiness"]),
                **{k: _pct(bands(1 - t.result[v])) for k, v in LOSS_KEYS.items()},
                "dose": [round(t.profile["prior_dose_msv"] + x, 1) for x in t.result["dose"]]}

    return {
        "baseline": {"arrival": a, "radiation": ra, "plan": base.plan.__dict__, "series": series(base)},
        "scenario": {"arrival": b, "radiation": rb, "plan": scen.plan.__dict__, "series": series(scen),
                     "radiation_events": scen.radiation.events},
        "delta": {
            "readiness": b["readiness"]["p50"] - a["readiness"]["p50"],
            **{k: (b["loss"][k]["p50"] - a["loss"][k]["p50"]) * 100 for k in names},
            "arrival_dose_msv": rb["arrival_msv"] - ra["arrival_msv"],
        },
        "summary": lines,
        "current_day": base.current_day,
    }


def run_optimizer(member: CrewMember, sw: dict, current_day: int, goal_readiness: float, goal_probability: float,
                  include_adherence: bool) -> dict:
    prof = profile(member)
    logs = logs_dict(member)
    rad = radiation_inputs(sw)
    priors = personal_priors(prof)
    measurements = [measurement_dict(x, member) for x in member.measurements]
    habit_inputs = build_inputs(logs, current_day, habit_plan(prof), rad)
    post = twin_update.posterior(priors, measurements, habit_inputs)
    rates = draw_rates(np.random.default_rng(seed_for(prof["id"])), P.OPTIMIZER_RUNS, prof["r_bone_hip"],
                       priors["muscle"][0], 1.0, posterior=post if measurements else None)
    out = optimize(logs, current_day, rates, rad, sleep_h=prof["sleep_mean_h"],
                   adherence=prof["compliance"] if include_adherence else 1.0, goal_readiness=goal_readiness,
                   goal_probability=goal_probability)
    out["current_day"] = current_day
    out["crew_id"] = prof["id"]
    return out


_calibration_cache: dict[tuple, dict] = {}


def experiment(member: CrewMember, sw: dict, seed: int, interval: int) -> dict:
    """Hidden-truth experiment using this astronaut's full logged mission as the behaviour record,
    plus the updater's measured calibration over 200 hidden astronauts (cached per crew + interval)."""
    logs = logs_dict(member)
    inputs = build_inputs(logs, P.MISSION_DAYS, habit_plan(profile(member)), radiation_inputs(sw))
    key = (member.id, interval)
    if key not in _calibration_cache:
        _calibration_cache[key] = twin_update.calibration(inputs, interval=interval)
    return {"crew_id": member.id, "calibration": _calibration_cache[key],
            **twin_update.hidden_truth_experiment(inputs, seed=seed, interval=interval)}
