"""Bayesian personalisation of the twin from check-up measurements.

Each sub-model is (to first order) linear in one personal parameter θ after a
log transform, so every update is a closed-form Gaussian one:

    bone   : log(BMD_t)                   ≈ θ_bone   · x_t,  x_t = −Σ (1 + k(1−c)) g / 30
    muscle : log(M_t)                     ≈ θ_muscle · x_t,  x_t = −Σ daily loss at θ = 1
    cardio : log((V_t − f) / (1 − f))     ≈ θ_cardio · x_t,  x_t = −λ Σ (1 − 0.7 c)

θ_bone is the hip loss rate per month; θ_muscle and θ_cardio are multipliers.
"""
import numpy as np

from app.simulation import models, params as P
from app.simulation.simulate import DailyInputs, Rates, arrival_summary, draw_rates, run_mission

METRICS = ("bone", "muscle", "cardio")


def design(metric: str, inputs: DailyInputs, day: int) -> float:
    """Regressor x_t for a measurement taken at the start of `day` (after `day` days of flight)."""
    if day <= 0:
        return 0.0
    c_res = np.asarray(inputs.c_res)[:day]
    if metric == "bone":
        return float(-np.sum((1 + P.K_BONE * (1 - c_res)) * P.GRAVITY_TRANSIT) / 30.0)
    if metric == "muscle":
        return float(-np.sum(models.muscle_daily_loss(c_res, np.asarray(inputs.sleep_h)[:day])))
    if metric == "cardio":
        return float(-P.LAMBDA_CARDIO * np.sum(1 - P.CARDIO_EX_EFFECT * np.asarray(inputs.c_cardio)[:day]))
    raise ValueError(metric)


def observation(metric: str, rel_value: float, predicted_gap: float | None = None) -> tuple[float, float]:
    """Transform a relative measurement (1.0 = baseline) into (y, σ_y).

    VO2 noise is additive, so σ_y = σ / gap. The gap used for σ_y is the twin's *predicted* gap: using the
    measured one would give lucky high readings more weight and bias θ_cardio low.
    """
    if metric == "bone":
        return float(np.log(rel_value)), P.NOISE_BONE
    if metric == "muscle":
        return float(np.log(rel_value)), P.NOISE_MUSCLE
    gap = max(rel_value - P.V_FLOOR_FRAC, 0.02)
    ref = max(predicted_gap if predicted_gap is not None else gap, 0.02)
    return float(np.log(gap / (1 - P.V_FLOOR_FRAC))), P.NOISE_VO2 / ref


def gaussian_update(mu: float, sd: float, x: float, y: float, sd_y: float) -> tuple[float, float]:
    """Posterior of θ given y = θ·x + ε, ε ~ N(0, sd_y²), prior θ ~ N(mu, sd²)."""
    precision = 1 / sd**2 + x**2 / sd_y**2
    mean = (mu / sd**2 + x * y / sd_y**2) / precision
    return float(mean), float(precision**-0.5)


def posterior(priors: dict, measurements: list[dict], inputs: DailyInputs) -> dict:
    """priors: {metric: (mean, sd)}; measurements: [{day, metric, rel_value}] → {metric: (mean, sd)}."""
    post = dict(priors)
    for m in sorted(measurements, key=lambda m: m["day"]):
        metric = m["metric"]
        x = design(metric, inputs, m["day"])
        if x == 0.0:
            continue
        predicted_gap = (1 - P.V_FLOOR_FRAC) * np.exp(post[metric][0] * x) if metric == "cardio" else None
        y, sd_y = observation(metric, m["rel_value"], predicted_gap)
        post[metric] = gaussian_update(*post[metric], x, y, sd_y)
    return post


def priors_for(r_bone: float, muscle_mult: float, cardio_mult: float = 1.0) -> dict:
    return {
        "bone": (r_bone, r_bone * P.RATE_SIGMA_PERSONAL),
        "muscle": (muscle_mult, muscle_mult * P.RATE_SIGMA_OTHER),
        "cardio": (cardio_mult, cardio_mult * P.RATE_SIGMA_OTHER),
    }


def population_priors() -> dict:
    return {
        "bone": (P.R_BONE_HIP_POP_MEAN, P.R_BONE_HIP_POP_MEAN * P.R_BONE_HIP_POP_SIGMA),
        "muscle": (1.0, P.RATE_SIGMA_OTHER),
        "cardio": (1.0, P.RATE_SIGMA_OTHER),
    }


def noisy_checkups(rng, run: dict, i: int, days: list[int]) -> list[dict]:
    """Check-up measurements of trajectory `i` in a recorded run, with realistic measurement noise."""
    out = []
    for day in days:
        for metric, key, noise in (("bone", "bone", P.NOISE_BONE), ("muscle", "muscle", P.NOISE_MUSCLE),
                                   ("cardio", "vo2", P.NOISE_VO2)):
            true_val = float(run[key][i, day])
            measured = true_val + rng.normal(0, noise) if metric == "cardio" else true_val * (1 + rng.normal(0, noise))
            out.append({"day": day, "metric": metric, "rel_value": measured, "true_value": true_val})
    return out


def calibration(inputs: DailyInputs, interval: int = 30, n: int = 200, seed: int = 12345) -> dict:
    """Share of hidden astronauts whose true rate lies inside the twin's final 90 % credible band."""
    rng = np.random.default_rng(seed)
    truths = Rates(P.R_BONE_HIP_POP_MEAN * rng.lognormal(0, P.R_BONE_HIP_POP_SIGMA, n),
                   rng.lognormal(0, P.RATE_SIGMA_OTHER, n), rng.lognormal(0, P.RATE_SIGMA_OTHER, n))
    run = run_mission(truths, inputs)  # all hidden astronauts in one vectorised batch
    days = list(range(interval, inputs.days, interval))
    true_vals = {"bone": truths.r_bone, "muscle": truths.muscle_mult, "cardio": truths.cardio_mult}
    hits = {m: 0 for m in METRICS}
    for i in range(n):
        post = posterior(population_priors(), noisy_checkups(rng, run, i, days), inputs)
        for m in METRICS:
            hits[m] += abs(post[m][0] - true_vals[m][i]) <= 1.645 * post[m][1]
    return {"astronauts": n, "nominal": 0.9, "coverage": {m: float(hits[m]) / n for m in METRICS}}


def hidden_truth_experiment(inputs: DailyInputs, seed: int = 7, interval: int = 30, runs: int = 300) -> dict:
    """Draw a secret astronaut, generate noisy check-ups, and show the twin converging to the truth."""
    rng = np.random.default_rng(seed)
    truth = {
        "bone": float(P.R_BONE_HIP_POP_MEAN * rng.lognormal(0, P.R_BONE_HIP_POP_SIGMA)),
        "muscle": float(rng.lognormal(0, P.RATE_SIGMA_OTHER)),
        "cardio": float(rng.lognormal(0, P.RATE_SIGMA_OTHER)),
    }
    true_run = run_mission(
        Rates(np.array([truth["bone"]]), np.array([truth["muscle"]]), np.array([truth["cardio"]])), inputs)
    true_arrival = arrival_summary(true_run)

    checkup_days = list(range(interval, inputs.days, interval))
    measurements = noisy_checkups(rng, true_run, 0, checkup_days)

    steps = []
    priors = population_priors()
    for k in range(len(checkup_days) + 1):
        seen = [m for m in measurements if m["day"] in checkup_days[:k]]
        post = posterior(priors, seen, inputs)
        forecast = run_mission(draw_rates(np.random.default_rng(seed + 1), runs, 0, posterior=post), inputs,
                               record=False)
        summary = arrival_summary(forecast)
        steps.append({
            "checkups": k,
            "day": checkup_days[k - 1] if k else 0,
            "posterior": {m: {"mean": post[m][0], "sd": post[m][1]} for m in METRICS},
            "arrival": summary,
        })
    return {
        "truth": truth,
        "true_arrival": true_arrival,
        "population_prior": {m: {"mean": priors[m][0], "sd": priors[m][1]} for m in METRICS},
        "checkup_days": checkup_days,
        "measurements": measurements,
        "steps": steps,
    }
