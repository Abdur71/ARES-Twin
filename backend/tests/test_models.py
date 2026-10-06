"""The engine must reproduce the published numbers and the README reference scenarios."""
import numpy as np
import pytest

from app.simulation import models, params as P
from app.simulation.readiness import readiness, status, subscores
from app.simulation.simulate import DailyInputs, Rates, arrival_summary, draw_rates, run_mission


def constant_inputs(c: float, days: int = P.MISSION_DAYS, sleep: float = 7.0) -> DailyInputs:
    return DailyInputs(np.full(days, c), np.full(days, c), np.full(days, sleep), np.full(days, 1.3),
                       np.zeros(days), np.zeros(days, dtype=bool))


def mid_rates() -> Rates:
    return Rates(np.array([P.R_BONE_HIP_POP_MEAN]), np.array([1.0]), np.array([1.0]))


@pytest.mark.parametrize("c, bone, muscle, cardio, score, band", [
    (1.0, 10.6, 18.3, 16.6, 80, "GREEN"),
    (0.5, 13.1, 35.5, 27.5, 53, "AMBER"),
    (0.0, 15.5, 49.1, 33.3, 24, "RED"),
])
def test_reference_scenarios(c, bone, muscle, cardio, score, band):
    a = arrival_summary(run_mission(mid_rates(), constant_inputs(c)))
    assert a["loss"]["bone"]["p50"] * 100 == pytest.approx(bone, abs=0.1)
    assert a["loss"]["muscle"]["p50"] * 100 == pytest.approx(muscle, abs=0.1)
    assert a["loss"]["cardio"]["p50"] * 100 == pytest.approx(cardio, abs=0.1)
    assert a["readiness"]["p50"] == pytest.approx(score, abs=0.6)
    assert a["status"] == band


def test_six_month_published_values():
    r = run_mission(mid_rates(), constant_inputs(1.0, days=180))
    assert 0.06 <= 1 - r["bone"][0, -1] <= 0.09  # hip 6–9 %
    assert 1 - r["muscle"][0, -1] == pytest.approx(0.13, abs=0.01)  # calf −13 %
    assert 1 - r["vo2"][0, -1] == pytest.approx(0.12, abs=1e-3)  # λ calibration (continuous vs daily steps)


def test_radiation_dose_and_shelter():
    days = 10
    inputs = DailyInputs(np.ones(days), np.ones(days), np.full(days, 7.0), np.full(days, 1.3),
                         np.r_[np.zeros(5), [80.0], np.zeros(4)], np.r_[np.zeros(5, bool), [True], np.zeros(4, bool)])
    dose = run_mission(mid_rates(), inputs)["dose"]
    assert dose[-1] == pytest.approx(13 + 80 * P.SHELTER_FACTOR)


def test_full_transit_dose_matches_readme():
    assert run_mission(mid_rates(), constant_inputs(1.0))["dose"][-1] == pytest.approx(351.0)


def test_sleep_loss_increases_muscle_loss():
    rested = run_mission(mid_rates(), constant_inputs(1.0, sleep=7.0))["muscle"][0, -1]
    tired = run_mission(mid_rates(), constant_inputs(1.0, sleep=5.0))["muscle"][0, -1]
    assert tired < rested


def test_cardio_subscore_can_reach_zero():
    # V_floor = 60 % → max loss 40 % = the cardio limit
    assert subscores(0, 0, 1 - P.V_FLOOR_FRAC)["cardio"] == pytest.approx(0.0)


def test_status_cap_on_weak_subsystem():
    subs = {"bone": 1.0, "muscle": 0.3, "cardio": 1.0}
    assert status(80, subs) == "AMBER"
    assert status(80, {"bone": 1, "muscle": 1, "cardio": 1}) == "GREEN"
    assert status(49.9) == "RED"


def test_readiness_bounds():
    assert readiness(0, 0, 0) == pytest.approx(100)
    assert readiness(0.2, 0.5, 0.4) == pytest.approx(0)


@pytest.mark.parametrize("pfu, level, dose", [(5, 0, 0.0), (10, 1, 0.5), (100, 2, 2.0), (1000, 3, 10.0),
                                              (100_000, 5, 200.0)])
def test_spe_dose_map(pfu, level, dose):
    assert models.s_scale(pfu) == level
    assert models.spe_dose_from_pfu(pfu) == pytest.approx(dose)


def test_spe_dose_interpolates_monotonically():
    doses = [models.spe_dose_from_pfu(p) for p in (20, 200, 2000, 20000, 200000)]
    assert doses == sorted(doses)


def test_monte_carlo_band_contains_median():
    rates = draw_rates(np.random.default_rng(0), P.MC_RUNS, P.R_BONE_HIP_POP_MEAN)
    a = arrival_summary(run_mission(rates, constant_inputs(1.0)))
    r = a["readiness"]
    assert r["p5"] < r["p50"] < r["p95"]
    assert r["p50"] == pytest.approx(80, abs=2)
