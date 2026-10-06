"""Bayesian twin updater: correctness of the Gaussian update and calibration on hidden truths."""
import numpy as np
import pytest

from app.crew.generator import generate_logs, load_crew
from app.simulation import params as P, twin_update
from app.simulation.scenario import Radiation, build_inputs, habit_plan
from app.simulation.simulate import Rates, run_mission


@pytest.fixture(scope="module")
def inputs():
    data = load_crew()
    member = data["crew"][0]
    days = P.MISSION_DAYS
    rad = Radiation(np.full(days, 1.3), np.zeros(days), np.zeros(days, dtype=bool))
    return build_inputs(generate_logs(member, data["crew_events"]), days, habit_plan(member), rad)


def test_gaussian_update_shrinks_uncertainty():
    # data alone says θ = 1.2 with σ = 0.03 / 0.2 = 0.15 — same weight as the prior → posterior mean 1.1
    mean, sd = twin_update.gaussian_update(1.0, 0.15, x=-0.2, y=-0.24, sd_y=0.03)
    assert mean == pytest.approx(1.1)
    assert sd == pytest.approx(0.15 / np.sqrt(2))


def test_noise_free_measurements_move_towards_truth(inputs):
    truth = {"bone": 0.0145, "muscle": 1.2, "cardio": 0.85}
    run = run_mission(Rates(*(np.array([truth[k]]) for k in ("bone", "muscle", "cardio"))), inputs)
    ms = [{"day": d, "metric": m, "rel_value": float(run[key][0, d])}
          for d in range(30, P.MISSION_DAYS, 30) for m, key in (("bone", "bone"), ("muscle", "muscle"),
                                                               ("cardio", "vo2"))]
    priors = twin_update.population_priors()
    post = twin_update.posterior(priors, ms, inputs)
    for k, v in truth.items():  # prior shrinkage remains (most for weakly-informative VO2 tests)
        assert abs(post[k][0] - v) < abs(priors[k][0] - v)
        assert abs(post[k][0] - v) < 2 * post[k][1]


def test_posterior_is_calibrated(inputs):
    """Across many hidden astronauts, the truth lies within ±1.645 σ about 90 % of the time."""
    hits = {k: [] for k in twin_update.METRICS}
    for seed in range(120):
        rng = np.random.default_rng(seed)
        truth = {"bone": P.R_BONE_HIP_POP_MEAN * rng.lognormal(0, P.R_BONE_HIP_POP_SIGMA),
                 "muscle": rng.lognormal(0, P.RATE_SIGMA_OTHER), "cardio": rng.lognormal(0, P.RATE_SIGMA_OTHER)}
        run = run_mission(Rates(*(np.array([truth[k]]) for k in ("bone", "muscle", "cardio"))), inputs)
        ms = []
        for d in range(30, P.MISSION_DAYS, 30):
            ms.append({"day": d, "metric": "bone", "rel_value": run["bone"][0, d] * (1 + rng.normal(0, P.NOISE_BONE))})
            ms.append({"day": d, "metric": "muscle",
                       "rel_value": run["muscle"][0, d] * (1 + rng.normal(0, P.NOISE_MUSCLE))})
            ms.append({"day": d, "metric": "cardio", "rel_value": run["vo2"][0, d] + rng.normal(0, P.NOISE_VO2)})
        post = twin_update.posterior(twin_update.population_priors(), ms, inputs)
        for k in hits:
            hits[k].append(abs(post[k][0] - truth[k]) < 1.645 * post[k][1])
    for k, v in hits.items():
        assert 0.8 <= np.mean(v) <= 0.98, k


def test_hidden_truth_experiment_narrows_band(inputs):
    out = twin_update.hidden_truth_experiment(inputs, seed=3, runs=200)
    first, last = out["steps"][0], out["steps"][-1]
    assert len(out["steps"]) == len(out["checkup_days"]) + 1
    for k in twin_update.METRICS:
        assert last["posterior"][k]["sd"] < first["posterior"][k]["sd"]
    width = lambda s: s["arrival"]["readiness"]["p95"] - s["arrival"]["readiness"]["p5"]  # noqa: E731
    assert width(last) < width(first)
