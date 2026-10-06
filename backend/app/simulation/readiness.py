"""Readiness score, status bands and radiation budget."""
import numpy as np

from app.simulation import params as P


def subscore(loss, limit):
    """S = max(0, 1 − (loss / limit)²)."""
    return np.maximum(0.0, 1 - (np.asarray(loss) / limit) ** 2)


def subscores(bone_loss, muscle_loss, cardio_loss):
    return {
        "bone": subscore(bone_loss, P.LOSS_LIMITS["bone"]),
        "muscle": subscore(muscle_loss, P.LOSS_LIMITS["muscle"]),
        "cardio": subscore(cardio_loss, P.LOSS_LIMITS["cardio"]),
    }


def readiness(bone_loss, muscle_loss, cardio_loss):
    """Composite 0–100 score (vectorised)."""
    s = subscores(bone_loss, muscle_loss, cardio_loss)
    return 100 * sum(P.WEIGHTS[k] * s[k] for k in s)


def status(score: float, subs: dict | None = None) -> str:
    """GREEN ≥ 70, AMBER 50–69, RED < 50; any sub-score < 0.4 caps the status at AMBER."""
    if score >= P.GREEN_MIN:
        band = "GREEN"
    elif score >= P.AMBER_MIN:
        band = "AMBER"
    else:
        band = "RED"
    if band == "GREEN" and subs and min(float(v) for v in subs.values()) < P.SUBSCORE_CAP:
        band = "AMBER"
    return band


def radiation_budget(prior_msv: float, mission_now: float, mission_arrival: float, gcr_scenario: str,
                     max_event_msv: float) -> dict:
    """Career dose budget with projection lines to arrival and to the end of a conjunction-class mission."""
    gcr = P.GCR_SCENARIOS[gcr_scenario]
    end_of_mission = mission_arrival + gcr["surface"] * P.SURFACE_STAY_DAYS + gcr["transit"] * P.RETURN_DAYS
    career_arrival = prior_msv + mission_arrival
    career_end = prior_msv + end_of_mission
    if career_arrival >= P.CAREER_LIMIT_MSV or max_event_msv >= P.SHORT_TERM_LIMIT:
        band = "RED"
    elif career_end >= P.CAREER_LIMIT_MSV or career_arrival >= 0.75 * P.CAREER_LIMIT_MSV:
        band = "AMBER"
    else:
        band = "GREEN"
    return {
        "limit_msv": P.CAREER_LIMIT_MSV,
        "prior_msv": round(prior_msv, 1),
        "used_msv": round(prior_msv + mission_now, 1),
        "arrival_msv": round(career_arrival, 1),
        "end_of_mission_msv": round(career_end, 1),
        "used_fraction": round((prior_msv + mission_now) / P.CAREER_LIMIT_MSV, 4),
        "arrival_fraction": round(career_arrival / P.CAREER_LIMIT_MSV, 4),
        "max_single_event_msv": round(max_event_msv, 1),
        "short_term_limit": P.SHORT_TERM_LIMIT,
        "status": band,
        "gcr_scenario": gcr_scenario,
    }
