"""Daily loop + vectorised Monte Carlo.

State arrays have shape (runs,); the loop runs over mission days only, so 500
runs × 270 days takes a few milliseconds.
"""
from dataclasses import dataclass

import numpy as np

from app.simulation import models, params as P
from app.simulation.readiness import readiness, status, subscores


@dataclass
class DailyInputs:
    """Per-day inputs. Behaviour arrays may be (days,) or (runs, days)."""

    c_res: np.ndarray
    c_cardio: np.ndarray
    sleep_h: np.ndarray
    gcr_msv: np.ndarray  # (days,)
    spe_msv: np.ndarray  # (days,) unsheltered SPE dose at the spacecraft
    sheltered: np.ndarray  # (days,) bool

    @property
    def days(self) -> int:
        return self.gcr_msv.shape[-1]


@dataclass
class Rates:
    """Per-run personal rates, each shape (runs,)."""

    r_bone: np.ndarray  # per month
    muscle_mult: np.ndarray
    cardio_mult: np.ndarray

    @property
    def runs(self) -> int:
        return self.r_bone.shape[0]


def _draw(rng, runs, mean, sigma_log, posterior):
    if posterior is not None:  # Bayesian posterior: truncated normal
        mu, sd = posterior
        return np.clip(rng.normal(mu, sd, runs), 0.1 * mu, None)
    return mean * rng.lognormal(0.0, sigma_log, runs)  # prior: log-normal around the personal estimate


def draw_rates(rng, runs, r_bone, muscle_mult=1.0, cardio_mult=1.0, posterior: dict | None = None) -> Rates:
    posterior = posterior or {}
    return Rates(
        r_bone=_draw(rng, runs, r_bone, P.RATE_SIGMA_PERSONAL, posterior.get("bone")),
        muscle_mult=_draw(rng, runs, muscle_mult, P.RATE_SIGMA_OTHER, posterior.get("muscle")),
        cardio_mult=_draw(rng, runs, cardio_mult, P.RATE_SIGMA_OTHER, posterior.get("cardio")),
    )


def _col(arr, day):
    return arr[..., day] if arr.ndim > 1 else arr[day]


def radiation_track(inputs: DailyInputs) -> np.ndarray:
    """Cumulative mission dose (days+1,), identical across runs."""
    dose = np.zeros(inputs.days + 1)
    for d in range(inputs.days):
        dose[d + 1] = models.radiation_step(dose[d], inputs.gcr_msv[d], inputs.spe_msv[d], inputs.sheltered[d])
    return dose


def run_mission(rates: Rates, inputs: DailyInputs, record: bool = True) -> dict:
    """Run every Monte Carlo trajectory. Returns relative state (1.0 = baseline)."""
    R, D = rates.runs, inputs.days
    bone = np.ones(R)
    muscle = np.ones(R)
    vo2 = np.ones(R)
    if record:
        hist = {k: np.empty((R, D + 1)) for k in ("bone", "muscle", "vo2")}
        for k in hist:
            hist[k][:, 0] = 1.0
    for d in range(D):
        c_res = _col(inputs.c_res, d)
        bone = models.bone_step(bone, rates.r_bone, c_res)
        muscle = models.muscle_step(muscle, c_res, _col(inputs.sleep_h, d), rates.muscle_mult)
        vo2 = models.cardio_step(vo2, _col(inputs.c_cardio, d), rates.cardio_mult)
        if record:
            hist["bone"][:, d + 1] = bone
            hist["muscle"][:, d + 1] = muscle
            hist["vo2"][:, d + 1] = vo2
    out = hist if record else {"bone": bone, "muscle": muscle, "vo2": vo2}
    out["readiness"] = readiness(1 - out["bone"], 1 - out["muscle"], 1 - out["vo2"])
    out["dose"] = radiation_track(inputs)
    return out


PCTS = (5, 50, 95)


def bands(arr: np.ndarray, step: int = 1) -> dict:
    """P5 / P50 / P95 over runs for every `step`-th day (arr is (runs, days+1))."""
    p = np.percentile(arr[:, ::step], PCTS, axis=0)
    return {"p5": p[0].round(4).tolist(), "p50": p[1].round(4).tolist(), "p95": p[2].round(4).tolist()}


def arrival_summary(result: dict, day: int | None = None) -> dict:
    """Arrival-day (or `day`) losses, readiness and status from a recorded or final-only run."""
    def at(key):
        a = result[key]
        return a[:, -1 if day is None else day] if a.ndim > 1 else a

    losses = {"bone": 1 - at("bone"), "muscle": 1 - at("muscle"), "cardio": 1 - at("vo2")}
    score = at("readiness")
    med = {k: float(np.median(v)) for k, v in losses.items()}
    subs = {k: float(v) for k, v in subscores(med["bone"], med["muscle"], med["cardio"]).items()}
    r50 = float(np.median(score))
    return {
        "loss": {k: {"p5": float(np.percentile(v, 5)), "p50": med[k], "p95": float(np.percentile(v, 95))}
                 for k, v in losses.items()},
        "readiness": {"p5": float(np.percentile(score, 5)), "p10": float(np.percentile(score, 10)),
                      "p50": r50, "p95": float(np.percentile(score, 95))},
        "subscores": subs,
        "status": status(r50, subs),
    }


def prob_readiness_at_least(result: dict, threshold: float) -> float:
    score = result["readiness"]
    final = score[:, -1] if score.ndim > 1 else score
    return float(np.mean(final >= threshold))
