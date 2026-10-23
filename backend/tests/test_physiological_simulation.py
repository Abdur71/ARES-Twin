"""Comprehensive tests for extended Physiological & Mission Simulation modules:
- Partial gravity (0.38g) biomechanical unloading mitigation
- Dedicated Neuromuscular Strength model
- Sleep Architecture & Cumulative Sleep Debt dynamics
- Clinical Nephrolithiasis (Kidney Stone) Hypercalciuria risk
- Clinical SANS (Spaceflight-Associated Neuro-ocular Syndrome) ONSD progression
- Multi-phase 1040-day Conjunction-Class Mars Mission simulation
"""
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.simulation import clinical, models, params as P, phases
from app.simulation.simulate import DailyInputs, Rates, arrival_summary, run_mission


@pytest.fixture
def client():
    return TestClient(app)


def test_mars_partial_gravity_mitigates_bone_and_muscle_loss():
    """Martian gravity (0.38g) provides partial musculoskeletal loading, reducing deconditioning."""
    days = 100
    r_bone = np.array([P.R_BONE_HIP_POP_MEAN])
    rates = Rates(r_bone, np.array([1.0]), np.array([1.0]))

    # Microgravity (transit: g = 0.0, unloading = 1.0)
    transit_inputs = DailyInputs(
        c_res=np.full(days, 0.5), c_cardio=np.full(days, 0.5), sleep_h=np.full(days, 7.0),
        gcr_msv=np.full(days, 1.3), spe_msv=np.zeros(days), sheltered=np.zeros(days, bool),
        gravity_g=np.zeros(days)  # 0.0g
    )
    res_transit = run_mission(rates, transit_inputs, record=False)

    # Mars surface partial gravity (0.38g, unloading = 0.62)
    mars_inputs = DailyInputs(
        c_res=np.full(days, 0.5), c_cardio=np.full(days, 0.5), sleep_h=np.full(days, 7.0),
        gcr_msv=np.full(days, 0.8), spe_msv=np.zeros(days), sheltered=np.zeros(days, bool),
        gravity_g=np.full(days, P.GRAVITY_MARS)  # 0.38g
    )
    res_mars = run_mission(rates, mars_inputs, record=False)

    bone_loss_transit = 1.0 - res_transit["bone"][0]
    bone_loss_mars = 1.0 - res_mars["bone"][0]
    muscle_loss_transit = 1.0 - res_transit["muscle"][0]
    muscle_loss_mars = 1.0 - res_mars["muscle"][0]

    # Partial gravity must preserve bone and muscle compared to 0g microgravity
    assert bone_loss_mars < bone_loss_transit
    assert muscle_loss_mars < muscle_loss_transit
    # Bone loss on Mars should be roughly (1 - 0.38) = ~62% of microgravity loss
    assert bone_loss_mars / bone_loss_transit == pytest.approx(0.62, abs=0.03)


def test_strength_loss_exceeds_muscle_mass_loss():
    """Neuromuscular strength declines faster than muscle cross-sectional area due to neural adaptation decay."""
    days = 180
    rates = Rates(np.array([P.R_BONE_HIP_POP_MEAN]), np.array([1.0]), np.array([1.0]))
    inputs = DailyInputs(
        c_res=np.full(days, 1.0), c_cardio=np.full(days, 1.0), sleep_h=np.full(days, 7.0),
        gcr_msv=np.full(days, 1.3), spe_msv=np.zeros(days), sheltered=np.zeros(days, bool)
    )
    res = run_mission(rates, inputs, record=False)

    muscle_loss = 1.0 - res["muscle"][0]
    strength_loss = 1.0 - res["strength"][0]

    # Strength loss must exceed muscle mass loss (as observed in spaceflight studies)
    assert strength_loss > muscle_loss
    assert 0.15 <= strength_loss <= 0.25  # ~18-22% strength loss at 6 months


def test_sleep_debt_and_recovery_dynamics():
    """Chronic sleep deficit accumulates debt and degrades sleep quality; adequate sleep clears it."""
    debt = 0.0
    # 5 nights of restricted 5h sleep
    for _ in range(5):
        debt = models.sleep_debt_step(debt, 5.0)
    assert debt > 5.0  # Significant debt accumulated

    quality_impaired = models.sleep_quality_score(5.0, debt)
    assert quality_impaired < 60.0

    # 7 recovery nights of 8.5h sleep
    for _ in range(7):
        debt = models.sleep_debt_step(debt, 8.5)
    assert debt < 4.0  # Debt cleared from >10h down to <4h
    assert models.sleep_quality_score(8.0, debt) > 85.0


def test_kidney_stone_hypercalciuria_model():
    """Bone loss triggers elevated urinary calcium excretion and heightened nephrolithiasis risk."""
    baseline_ca = clinical.urinary_calcium_excretion(0.0)
    assert baseline_ca == pytest.approx(P.CA_EXCRETION_BASE_MG)
    assert clinical.kidney_stone_relative_risk(0.0) == pytest.approx(1.0)

    # 10% bone loss creates substantial hypercalciuria
    elevated_ca = clinical.urinary_calcium_excretion(0.10)
    assert elevated_ca > baseline_ca + 100.0  # Significant calcium excretion elevation

    elevated_rr = clinical.kidney_stone_relative_risk(0.10)
    assert elevated_rr > 2.0  # Relative risk more than doubles


def test_sans_onsd_trajectory_and_classification():
    """Optic nerve sheath expands non-linearly over prolonged microgravity duration."""
    onsd_start = clinical.sans_onsd_trajectory(0)
    onsd_90d = clinical.sans_onsd_trajectory(90)
    onsd_270d = clinical.sans_onsd_trajectory(270)

    assert onsd_start == pytest.approx(P.ONSD_BASELINE_MM)
    assert onsd_90d > onsd_start
    assert onsd_270d > onsd_90d
    assert onsd_270d <= round(P.ONSD_BASELINE_MM + P.ONSD_MAX_DELTA_MM, 2) + 0.01

    # Test severity classifications
    assert "Grade 0" in clinical.sans_severity_classification(5.2)
    assert "Grade 1" in clinical.sans_severity_classification(5.9)
    assert "Grade 2+" in clinical.sans_severity_classification(6.1)


def test_multi_phase_mission_environment_generation():
    """Generate environmental profiles for outbound, surface stay, return leg, and 1040-day conjunction mission."""
    full_env = phases.generate_mission_environment("full")
    assert full_env["days"] == 1040
    assert len(full_env["gravity_g"]) == 1040
    assert len(full_env["r_au"]) == 1040
    assert len(full_env["comm_delay_min"]) == 1040

    # Verify phase gravity values
    assert np.all(full_env["gravity_g"][:270] == 0.0)             # Outbound 0g
    assert np.all(full_env["gravity_g"][270:770] == P.GRAVITY_MARS) # Surface 0.38g
    assert np.all(full_env["gravity_g"][770:] == 0.0)             # Return 0g


def test_api_phases_and_conjunction_endpoints(client):
    """Test new API endpoints for mission phases and 1040-day conjunction simulation."""
    # Test phases endpoint
    resp_phases = client.get("/api/simulation/phases")
    assert resp_phases.status_code == 200
    data_phases = resp_phases.json()
    assert data_phases["total_mission_days"] == 1040
    assert "surface" in data_phases["phases"]

    # Test conjunction simulation endpoint
    resp_conj = client.get("/api/simulation/conjunction/rahman")
    assert resp_conj.status_code == 200
    data_conj = resp_conj.json()
    assert data_conj["total_days"] == 1040
    assert "mars_arrival" in data_conj["milestones"]
    assert "surface_departure" in data_conj["milestones"]
    assert "earth_return" in data_conj["milestones"]
    assert len(data_conj["series"]["strength_loss_pct"]["p50"]) > 50

    # Test clinical endpoint
    resp_clin = client.get("/api/simulation/clinical/rahman")
    assert resp_clin.status_code == 200
    data_clin = resp_clin.json()
    assert "kidney_stone" in data_clin["current"]
    assert "sans" in data_clin["current"]
    assert "urinary_calcium_mg_day" in data_clin["timeline"]

    # Test model endpoint returns extended equations and parameters
    resp_model = client.get("/api/model")
    assert resp_model.status_code == 200
    model_data = resp_model.json()
    assert "strength" in model_data["equations"]
    assert "kidney_stone" in model_data["equations"]
    assert "sans_onsd" in model_data["equations"]
    assert "mission_phases" in model_data
