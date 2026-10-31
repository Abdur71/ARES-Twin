"""Tests for Astrodynamics, 3D Planetary Ephemeris, Lambert Solver, and Mars EDL Physics:
- Standish JPL 3D planetary orbital elements & secular perturbations
- Solar conjunction blackout geometry and comm latency
- Universal variable Lambert boundary value solver & Delta-V budgeting
- Mars launch window porkchop plot optimizer & radiation trade-off
- Mars atmospheric entry, descent & landing (EDL) deceleration G-loads
- FastAPI endpoints for orbital trade studies
"""
from datetime import date
import math
import numpy as np
import pytest

from app.orbit import (
    date_to_jd,
    generate_porkchop_grid,
    list_launch_opportunities,
    planet_state,
    propagate_transfer_arc,
    simulate_mars_entry,
    solar_conjunction_and_comm,
    solve_lambert,
)
from app.orbit.ephemeris import AU_KM, J2000_JD, KM_S_PER_AU_DAY
from app.orbit.lambert import compute_mission_deltav


def test_julian_date_and_standish_ephemeris():
    """Verify Julian date conversion and 3D planetary state accuracy against JPL standards."""
    # J2000 epoch: 2000-01-01 12:00 UTC should be JD 2451545.0
    jd_2000 = date_to_jd(date(2000, 1, 1))
    assert abs(jd_2000 - (J2000_JD - 0.5)) < 1e-4

    # Earth 3D state on 2024-04-30
    r_earth, v_earth = planet_state("earth", date(2024, 4, 30))
    dist_earth = float(np.linalg.norm(r_earth))
    speed_earth_km_s = float(np.linalg.norm(v_earth)) * KM_S_PER_AU_DAY

    # Earth orbit must be close to 1 AU (0.98 - 1.02) and ~29.8 km/s
    assert 0.98 <= dist_earth <= 1.02
    assert 28.5 <= speed_earth_km_s <= 30.5

    # Mars 3D state on 2024-04-30
    r_mars, v_mars = planet_state("mars", date(2024, 4, 30))
    dist_mars = float(np.linalg.norm(r_mars))
    speed_mars_km_s = float(np.linalg.norm(v_mars)) * KM_S_PER_AU_DAY

    # Mars orbit is eccentric (1.38 - 1.67 AU) and orbital speed is ~24.1 km/s
    assert 1.38 <= dist_mars <= 1.67
    assert 21.5 <= speed_mars_km_s <= 26.5
    # Mars inclination is 1.85 deg -> non-zero Z coordinate in heliocentric ecliptic frame
    assert abs(r_mars[2]) > 0.01


def test_solar_conjunction_and_comm_latency():
    """Verify communication delay and radio blackout detection during solar conjunction."""
    # Craft directly behind the Sun relative to Earth
    r_earth = np.array([1.0, 0.0, 0.0])
    r_craft_blackout = np.array([-1.5, 0.01, 0.0])  # ~180 deg opposite side of the Sun

    comm = solar_conjunction_and_comm(r_craft_blackout, r_earth)
    assert comm["solar_conjunction_blackout"] is True
    assert comm["comm_status"] == "BLACKOUT"
    assert comm["solar_elongation_deg"] < 2.5
    assert comm["one_way_comm_delay_min"] > 15.0  # ~2.5 AU distance -> ~20 min

    # Craft on same side of Sun (nominal comm)
    r_craft_nominal = np.array([1.1, 0.4, 0.0])
    comm_nom = solar_conjunction_and_comm(r_craft_nominal, r_earth)
    assert comm_nom["solar_conjunction_blackout"] is False
    assert comm_nom["comm_status"] == "NOMINAL"


def test_universal_variable_lambert_solver():
    """Solve Earth-Mars transfer arc using Stumpff universal variables."""
    dep_date = date(2024, 10, 15)
    arr_date = date(2025, 7, 12)
    tof = (arr_date - dep_date).days

    r_earth, v_earth = planet_state("earth", dep_date)
    r_mars, v_mars = planet_state("mars", arr_date)

    v1, v2, info = solve_lambert(r_earth, r_mars, float(tof))
    assert info["converged"] is True
    assert 150.0 <= info["transfer_angle_deg"] <= 210.0

    # Delta-V metrics
    dv = compute_mission_deltav(v1, v_earth, v2, v_mars)
    assert 8.0 <= dv["c3_launch_energy_km2_s2"] <= 25.0
    assert 3.4 <= dv["dv_tmi_km_s"] <= 4.5
    assert 1.5 <= dv["dv_moi_km_s"] <= 3.2
    assert 5.0 <= dv["dv_total_km_s"] <= 8.0
    assert 5.0 <= dv["mars_direct_entry_speed_km_s"] <= 7.5

    # Transfer arc propagation
    arc = propagate_transfer_arc(r_earth, v1, dep_date, tof=30)
    assert len(arc) == 31
    assert arc[0]["r_au"] == pytest.approx(float(np.linalg.norm(r_earth)), rel=1e-2)
    assert arc[-1]["day"] == 30


def test_porkchop_launch_window_generator():
    """Generate 2D porkchop mesh and find optimal departure & fast transit options."""
    dep_start = date(2024, 10, 5)
    dep_end = date(2024, 10, 25)

    porkchop = generate_porkchop_grid(
        departure_start=dep_start,
        departure_end=dep_end,
        min_tof_days=180,
        max_tof_days=260,
        dep_step_days=10,
        tof_step_days=20
    )

    assert "optimal_minimum_energy" in porkchop
    assert "fast_transit_option" in porkchop
    opt = porkchop["optimal_minimum_energy"]
    assert opt is not None
    assert opt["dv_total"] > 0
    assert "radiation_tradeoff" in porkchop


def test_mars_edl_deceleration_and_crew_g_load():
    """Simulate Mars atmospheric entry corridor and verify peak G-force."""
    edl = simulate_mars_entry(
        entry_speed_km_s=6.1,
        entry_flight_path_angle_deg=-12.5,
        vehicle_mass_kg=15000.0,
        heat_shield_area_m2=50.0,
        drag_coefficient=1.6,
        lift_to_drag_ratio=0.28
    )

    assert 3.5 <= edl["peak_deceleration_g"] <= 7.0
    assert edl["peak_convective_heat_flux_w_cm2"] > 50.0
    assert edl["entry_duration_s"] > 100.0
    assert edl["crew_physiological_g_assessment"]["deconditioned_crew_tolerance_threshold_g"] == 5.5
    assert len(edl["trajectory"]) > 10


def test_orbit_api_endpoints(client):
    """Test FastAPI /api/orbit endpoints."""
    # 1. Windows catalog
    r_win = client.get("/api/orbit/windows")
    assert r_win.status_code == 200
    assert len(r_win.json()["opportunities"]) >= 5

    # 2. Ephemeris endpoint
    r_eph = client.get("/api/orbit/ephemeris?target_date=2024-04-30")
    assert r_eph.status_code == 200
    eph = r_eph.json()
    assert "earth" in eph and "mars" in eph
    assert len(eph["earth"]["position_au"]) == 3

    # 3. Lambert endpoint
    lambert_req = {
        "departure_date": "2024-10-15",
        "arrival_date": "2025-07-12"
    }
    r_lam = client.post("/api/orbit/lambert", json=lambert_req)
    assert r_lam.status_code == 200
    lam_data = r_lam.json()
    assert "deltav_metrics" in lam_data
    assert lam_data["deltav_metrics"]["dv_total_km_s"] > 5.0
    assert len(lam_data["trajectory_sampling"]) > 100

    # 4. EDL endpoint
    edl_req = {
        "entry_speed_km_s": 6.1,
        "entry_flight_path_angle_deg": -12.5,
        "vehicle_mass_kg": 15000.0
    }
    r_edl = client.post("/api/orbit/edl", json=edl_req)
    assert r_edl.status_code == 200
    edl_data = r_edl.json()
    assert "peak_deceleration_g" in edl_data
    assert edl_data["peak_deceleration_g"] > 3.0
