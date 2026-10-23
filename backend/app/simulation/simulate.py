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
    gravity_g: np.ndarray | None = None  # (days,) ambient planetary gravity in g (0.0=transit, 0.38=Mars)
    spe_attenuation: np.ndarray | None = None  # (days,) surface atmospheric/planetary shielding

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
        spe_mult = inputs.spe_attenuation[d] if inputs.spe_attenuation is not None else 1.0
        dose[d + 1] = models.radiation_step(dose[d], inputs.gcr_msv[d], inputs.spe_msv[d] * spe_mult, inputs.sheltered[d])
    return dose


def run_mission(rates: Rates, inputs: DailyInputs, record: bool = True) -> dict:
    """Run every Monte Carlo trajectory. Returns relative state (1.0 = baseline)."""
    R, D = rates.runs, inputs.days
    bone = np.ones(R)
    muscle = np.ones(R)
    vo2 = np.ones(R)
    strength = np.ones(R)
    sleep_debt = np.zeros(R)
    sleep_quality = np.full(R, 100.0)

    if record:
        hist = {k: np.empty((R, D + 1)) for k in ("bone", "muscle", "vo2", "strength", "sleep_debt", "sleep_quality")}
        for k in ("bone", "muscle", "vo2", "strength"):
            hist[k][:, 0] = 1.0
        hist["sleep_debt"][:, 0] = 0.0
        hist["sleep_quality"][:, 0] = 100.0

    for d in range(D):
        c_res = _col(inputs.c_res, d)
        sleep_d = _col(inputs.sleep_h, d)
        c_cardio = _col(inputs.c_cardio, d)

        # Ambient gravity unloading (defaults to microgravity 1.0 if not passed)
        if inputs.gravity_g is not None:
            g_unloading = models.effective_gravity_unloading(_col(inputs.gravity_g, d))
        else:
            g_unloading = P.GRAVITY_TRANSIT

        # Sleep architecture evolution
        sleep_debt = models.sleep_debt_step(sleep_debt, sleep_d)
        sleep_quality = models.sleep_quality_score(sleep_d, sleep_debt)

        # Bone step with ambient gravity unloading
        bone = models.bone_step(bone, rates.r_bone, c_res, gravity=g_unloading)

        # Muscle daily loss & step
        m_loss = models.muscle_daily_loss(c_res, sleep_d, rates.muscle_mult, gravity=g_unloading)
        muscle = muscle * (1.0 - m_loss)

        # Neuromuscular strength step
        strength = models.strength_step(strength, c_res, m_loss, rates.muscle_mult, gravity=g_unloading)

        # Cardio step
        vo2 = models.cardio_step(vo2, c_cardio, rates.cardio_mult)

        if record:
            hist["bone"][:, d + 1] = bone
            hist["muscle"][:, d + 1] = muscle
            hist["vo2"][:, d + 1] = vo2
            hist["strength"][:, d + 1] = strength
            hist["sleep_debt"][:, d + 1] = sleep_debt
            hist["sleep_quality"][:, d + 1] = sleep_quality

    out = hist if record else {
        "bone": bone, "muscle": muscle, "vo2": vo2, "strength": strength,
        "sleep_debt": sleep_debt, "sleep_quality": sleep_quality,
    }
    out["readiness"] = readiness(1 - out["bone"], 1 - out["muscle"], 1 - out["vo2"])
    out["dose"] = radiation_track(inputs)
    return out


PCTS = (5, 50, 95)


def bands(arr: np.ndarray, step: int = 1) -> dict:
    """P5 / P50 / P95 over runs for every `step`-th day (arr is (runs, days+1))."""
    p = np.percentile(arr[:, ::step], PCTS, axis=0)
    return {"p5": p[0].round(4).tolist(), "p50": p[1].round(4).tolist(), "p95": p[2].round(4).tolist()}


def arrival_summary(result: dict, day: int | None = None) -> dict:
    """Arrival-day (or `day`) losses, readiness, status and clinical risks from a recorded or final-only run."""
    def at(key):
        a = result[key]
        return a[:, -1 if day is None else day] if a.ndim > 1 else a

    losses = {
        "bone": 1 - at("bone"),
        "muscle": 1 - at("muscle"),
        "cardio": 1 - at("vo2"),
    }
    if "strength" in result:
        losses["strength"] = 1 - at("strength")

    score = at("readiness")
    med = {k: float(np.median(v)) for k, v in losses.items()}
    subs = {k: float(v) for k, v in subscores(med["bone"], med["muscle"], med["cardio"]).items()}
    if "strength" in losses:
        from app.simulation.readiness import subscore
        subs["strength"] = float(subscore(med["strength"], P.LOSS_LIMITS["strength"]))

    r50 = float(np.median(score))
    d_idx = result["bone"].shape[-1] - 1 if (result["bone"].ndim > 1 and day is None) else (day or P.MISSION_DAYS)

    from app.simulation.clinical import clinical_summary
    clin = clinical_summary(losses["bone"], d_idx)

    res = {
        "loss": {k: {"p5": float(np.percentile(v, 5)), "p50": med[k], "p95": float(np.percentile(v, 95))}
                 for k, v in losses.items()},
        "readiness": {"p5": float(np.percentile(score, 5)), "p10": float(np.percentile(score, 10)),
                      "p50": r50, "p95": float(np.percentile(score, 95))},
        "subscores": subs,
        "status": status(r50, {k: subs[k] for k in ("bone", "muscle", "cardio")}),
        "clinical": clin,
    }

    if "sleep_debt" in result:
        debt_val = float(np.median(at("sleep_debt")))
        q_val = float(np.median(at("sleep_quality")))
        res["sleep"] = {
            "cumulative_debt_h": round(debt_val, 1),
            "quality_index": round(q_val, 1),
            "status": "IMPAIRED" if debt_val >= P.SLEEP_DEBT_IMPAIRMENT_THRESH else "OPTIMAL"
        }

    return res


def prob_readiness_at_least(result: dict, threshold: float) -> float:
    score = result["readiness"]
    final = score[:, -1] if score.ndim > 1 else score
    return float(np.mean(final >= threshold))

