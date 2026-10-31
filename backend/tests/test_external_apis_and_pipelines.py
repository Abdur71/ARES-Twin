"""Comprehensive test suite for External APIs & Pipelines:
1. NOAA SWPC Real-Time Proton Flux Feed (Live Mode, S-scale classification, shelter alert)
2. CCMC Mars SEP Scoreboard (Parker spiral magnetic footpoint connectivity, Mars surface vs orbit dose)
3. NOAA NCEI GOES-16/18 SGPS Fluence Pipeline (Energy spectrum, depth-dose curve, organ-specific dose)
4. NASA OSDR RadLab Dosimeter Pipeline (Empirical flight benchmark comparison)
5. CDC NHANES Population Baseline Pipeline (Multivariate statistical astronaut candidate sampling)
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.pipelines import nhanes, radlab
from app.spaceweather import mars_sep, sgps_fluence, swpc_live


@pytest.fixture
def client():
    return TestClient(app)


# ---------------------------------------------------------------------------
# 1. NOAA SWPC Real-Time Feed Tests
# ---------------------------------------------------------------------------
def test_swpc_records_parsing_and_s_scale():
    sample_records = [
        {"time_tag": "2026-10-30T10:00:00Z", "energy": ">=10 MeV", "flux": 15.0},
        {"time_tag": "2026-10-30T10:05:00Z", "energy": ">=10 MeV", "flux": 125.0},
        {"time_tag": "2026-10-30T10:05:00Z", "energy": ">=50 MeV", "flux": 28.0},
        {"time_tag": "2026-10-30T10:05:00Z", "energy": ">=100 MeV", "flux": 4.5},
    ]
    parsed = swpc_live.parse_swpc_records(sample_records)
    assert parsed["status"] == "active"
    assert parsed["current_flux_10mev_pfu"] == 125.0
    assert parsed["current_s_level"] == 2  # S2 >= 100 pfu
    assert parsed["shelter_recommendation"]["shelter_active"] is True
    assert "SHELTER IMMEDIATELY" in parsed["shelter_recommendation"]["status"]


def test_swpc_fallback_feed():
    fallback = swpc_live.fallback_live_feed()
    assert len(fallback) > 30
    parsed = swpc_live.parse_swpc_records(fallback)
    assert parsed["current_s_level"] == 0  # Quiet background
    assert parsed["shelter_recommendation"]["shelter_active"] is False


def test_api_spaceweather_live_endpoint(client):
    resp = client.get("/api/spaceweather/live?window_days=1")
    assert resp.status_code == 200
    data = resp.json()
    assert "source" in data
    assert "data" in data
    assert "current_s_scale" in data["data"]
    assert "dose_rate_1au" in data["data"]


# ---------------------------------------------------------------------------
# 2. CCMC Mars SEP Scoreboard & Parker Spiral Tests
# ---------------------------------------------------------------------------
def test_parker_spiral_geometry():
    # Mars at 1.524 AU must have a larger footpoint winding angle than Earth at 1.0 AU
    footpoint_earth = mars_sep.parker_spiral_footpoint(1.0)
    footpoint_mars = mars_sep.parker_spiral_footpoint(1.524)
    assert 45.0 <= footpoint_earth <= 65.0
    assert footpoint_mars > footpoint_earth + 20.0


def test_magnetic_connectivity_and_intensity_projection():
    # Eruption at W60 (well connected to Earth)
    proj_w60 = mars_sep.estimate_mars_sep_intensity(earth_peak_pfu=500.0, flare_source_lon_from_earth=58.0)
    assert proj_w60["earth_connection_quality"] > 0.8
    assert proj_w60["orbit_dose_msv"] > proj_w60["surface_dose_msv"]
    # Surface dose must benefit from ~15% atmospheric & planetary horizon shielding
    assert proj_w60["surface_dose_msv"] / proj_w60["orbit_dose_msv"] == pytest.approx(0.15, abs=0.01)


def test_api_mars_scoreboard_endpoint(client):
    resp = client.get("/api/spaceweather/mars-scoreboard?flare_lon=65&earth_pfu=120")
    assert resp.status_code == 200
    data = resp.json()
    assert "ensemble_models" in data
    assert "current_projection" in data
    assert "mars_s_scale" in data["current_projection"]
    assert len(data["ensemble_models"]) >= 3


# ---------------------------------------------------------------------------
# 3. NOAA GOES SGPS Fluence Pipeline Tests
# ---------------------------------------------------------------------------
def test_sgps_fluence_analysis_historical_storms():
    may_storm = sgps_fluence.analyze_fluence_event(historical_storm_key="may_2024")
    assert "Mother's Day" in may_storm["event_name"]
    assert len(may_storm["depth_dose_curve"]) >= 8
    
    # Shielding efficiency must increase with depth
    curve = may_storm["depth_dose_curve"]
    assert curve[0]["effective_dose_msv"] > curve[-1]["effective_dose_msv"]
    assert curve[-1]["protection_efficiency_pct"] > 85.0
    
    # Organ doses hierarchy: Skin > Lens > Bone Marrow (BFO) > Shelter
    organs = may_storm["organ_doses"]
    assert organs["skin_dose_msv"] > organs["eye_lens_dose_msv"]
    assert organs["eye_lens_dose_msv"] > organs["bfo_bone_marrow_msv"]
    assert organs["bfo_bone_marrow_msv"] > organs["storm_shelter_msv"]


def test_api_sgps_fluence_endpoints(client):
    # GET endpoint
    resp = client.get("/api/spaceweather/fluence?storm=halloween_2003")
    assert resp.status_code == 200
    data = resp.json()
    assert "analysis" in data
    assert data["analysis"]["spectrum"]["hardness"] == "HARD"

    # POST custom analysis endpoint
    custom_series = [10.0, 50.0, 150.0, 300.0, 120.0, 40.0, 5.0]
    resp_post = client.post("/api/spaceweather/fluence/analyze", json={
        "time_series_flux_10mev": custom_series,
        "time_step_hours": 2.0
    })
    assert resp_post.status_code == 200
    post_data = resp_post.json()
    assert "integrated_fluence" in post_data
    assert "organ_doses" in post_data


# ---------------------------------------------------------------------------
# 4. NASA OSDR RadLab Dosimeter Pipeline Tests
# ---------------------------------------------------------------------------
def test_radlab_flight_benchmarks():
    # Test cruise comparison against MSL/RAD flight measurement (1.84 mSv/day)
    comp_cruise = radlab.compare_with_simulation("measured", "transit")
    assert comp_cruise["empirical_flight_rate_msv"] == 1.84
    assert comp_cruise["model_daily_rate_msv"] == 1.84
    assert comp_cruise["relative_error_pct"] == pytest.approx(0.0)

    # Test surface comparison against Gale Crater measurement (0.64 mSv/day)
    comp_surf = radlab.compare_with_simulation("measured", "surface")
    assert comp_surf["empirical_flight_rate_msv"] == 0.64
    assert comp_surf["model_daily_rate_msv"] == 0.64
    assert comp_surf["relative_error_pct"] == pytest.approx(0.0)


def test_api_radlab_endpoints(client):
    resp_studies = client.get("/api/pipelines/radlab/studies")
    assert resp_studies.status_code == 200
    data = resp_studies.json()
    assert "OSD-MSL-CRUISE" in data["studies"]
    assert "OSD-MSL-SURFACE" in data["studies"]

    resp_bench = client.get("/api/pipelines/radlab/benchmark?scenario=design_goal&phase=transit")
    assert resp_bench.status_code == 200
    assert resp_bench.json()["model_daily_rate_msv"] == 1.3


# ---------------------------------------------------------------------------
# 5. CDC NHANES Population Baseline Pipeline Tests
# ---------------------------------------------------------------------------
def test_nhanes_candidate_sampling():
    male_prof = nhanes.sample_astronaut_profile(sex="male", age=45, fitness_percentile=0.90, seed=123)
    assert male_prof["demographics"]["sex"] == "male"
    assert male_prof["baseline"]["hip_bmd"] > 0.95
    assert male_prof["baseline"]["vo2peak"] > 40.0
    assert male_prof["clinical_markers"]["dxa_t_score"] > -1.0

    female_prof = nhanes.sample_astronaut_profile(sex="female", age=38, fitness_percentile=0.80, seed=456)
    assert female_prof["demographics"]["sex"] == "female"
    assert female_prof["baseline"]["hip_bmd"] > 0.85
    assert female_prof["baseline"]["vo2peak"] > 35.0


def test_nhanes_virtual_cohort_generation():
    cohort = nhanes.generate_virtual_cohort(cohort_size=4, seed=999)
    assert len(cohort) == 4
    for member in cohort:
        assert "name" in member
        assert "baseline" in member
        assert "hip_bmd" in member["baseline"]
        assert "leg_lean_kg" in member["baseline"]
        assert "vo2peak" in member["baseline"]


def test_api_nhanes_endpoints(client):
    resp_dist = client.get("/api/pipelines/nhanes/distributions")
    assert resp_dist.status_code == 200
    assert "male" in resp_dist.json()["cohorts"]

    resp_sample = client.get("/api/pipelines/nhanes/sample?sex=female&age=39&fitness_percentile=0.85")
    assert resp_sample.status_code == 200
    assert resp_sample.json()["demographics"]["sex"] == "female"

    resp_cohort = client.get("/api/pipelines/nhanes/cohort?cohort_size=4")
    assert resp_cohort.status_code == 200
    assert len(resp_cohort.json()["crew"]) == 4
