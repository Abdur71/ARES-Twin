"""FastAPI Router for Astrodynamics, 3D Planetary Ephemeris, Lambert Solver, and Mars EDL Physics."""
from datetime import date, timedelta
from typing import Optional
from fastapi import APIRouter, Query
import numpy as np
from pydantic import BaseModel, Field

from app.orbit import (
    generate_porkchop_grid,
    list_launch_opportunities,
    planet_state,
    propagate_transfer_arc,
    simulate_mars_entry,
    solar_conjunction_and_comm,
    solve_lambert,
)
from app.orbit.lambert import compute_mission_deltav

router = APIRouter(prefix="/orbit", tags=["Astrodynamics & Orbital Mechanics"])


# ---------------------------------------------------------------------------
# Request Schemas
# ---------------------------------------------------------------------------

class PorkchopIn(BaseModel):
    departure_start: date = Field(default=date(2024, 10, 1))
    departure_end: date = Field(default=date(2024, 11, 15))
    min_tof_days: int = Field(default=180, ge=120, le=350)
    max_tof_days: int = Field(default=300, ge=150, le=450)
    dep_step_days: int = Field(default=5, ge=1, le=15)
    tof_step_days: int = Field(default=10, ge=2, le=30)


class LambertIn(BaseModel):
    departure_date: date = Field(default=date(2024, 10, 15))
    arrival_date: Optional[date] = Field(default=None)
    tof_days: Optional[int] = Field(default=270, ge=100, le=500)


class EDLIn(BaseModel):
    entry_speed_km_s: float = Field(default=6.1, ge=4.0, le=9.0, description="Mars entry interface velocity (km/s)")
    entry_flight_path_angle_deg: float = Field(default=-12.5, ge=-20.0, le=-5.0, description="Entry flight path angle (deg)")
    vehicle_mass_kg: float = Field(default=15000.0, ge=1000.0, le=100000.0)
    heat_shield_area_m2: float = Field(default=50.0, ge=5.0, le=200.0)
    drag_coefficient: float = Field(default=1.6, ge=0.5, le=2.5)
    lift_to_drag_ratio: float = Field(default=0.28, ge=0.0, le=1.0)


# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------

@router.get("/windows", summary="Catalog of Mars launch opportunities through 2035")
def get_launch_windows():
    """Returns Earth-Mars conjunction launch windows across synodic cycles (2024, 2026, 2028, 2031, 2033)."""
    return {
        "description": "Earth-Mars Synodic Opportunities (~25.6 month recurrence)",
        "opportunities": list_launch_opportunities()
    }


@router.post("/porkchop", summary="Generate 2D porkchop contour mesh for launch window optimization")
def porkchop_contour(body: PorkchopIn):
    """Computes C3 launch energy, total Delta-V, and Time-of-Flight Pareto frontiers for orbital trade studies."""
    return generate_porkchop_grid(
        departure_start=body.departure_start,
        departure_end=body.departure_end,
        min_tof_days=body.min_tof_days,
        max_tof_days=body.max_tof_days,
        dep_step_days=body.dep_step_days,
        tof_step_days=body.tof_step_days
    )


@router.post("/lambert", summary="Universal variable Lambert transfer trajectory solver")
def solve_transfer(body: LambertIn):
    """Solves the Keplerian boundary value problem between Earth and Mars, computing TMI and MOI Delta-Vs."""
    dep = body.departure_date
    if body.arrival_date is not None:
        arr = body.arrival_date
        tof = (arr - dep).days
    else:
        tof = body.tof_days or 270
        arr = dep + timedelta(days=tof)

    if tof <= 0:
        tof = 270
        arr = dep + timedelta(days=tof)

    r_earth, v_earth = planet_state("earth", dep)
    r_mars, v_mars = planet_state("mars", arr)

    v1_craft, v2_craft, info = solve_lambert(r_earth, r_mars, float(tof))
    dv_metrics = compute_mission_deltav(v1_craft, v_earth, v2_craft, v_mars)
    trajectory_arc = propagate_transfer_arc(r_earth, v1_craft, dep, tof)

    return {
        "departure_date": dep.isoformat(),
        "arrival_date": arr.isoformat(),
        "tof_days": tof,
        "deltav_metrics": dv_metrics,
        "lambert_convergence": info,
        "trajectory_sampling": trajectory_arc
    }


@router.post("/edl", summary="Simulate Mars atmospheric entry, descent & deceleration physics")
def simulate_edl(body: EDLIn):
    """Simulates aerodynamic entry corridor, peak G-load, stagnation heat flux, and crew deceleration tolerance."""
    return simulate_mars_entry(
        entry_speed_km_s=body.entry_speed_km_s,
        entry_flight_path_angle_deg=body.entry_flight_path_angle_deg,
        vehicle_mass_kg=body.vehicle_mass_kg,
        heat_shield_area_m2=body.heat_shield_area_m2,
        drag_coefficient=body.drag_coefficient,
        lift_to_drag_ratio=body.lift_to_drag_ratio
    )


@router.get("/ephemeris", summary="High-precision 3D planetary positions and solar conjunction status")
def ephemeris_query(target_date: Optional[date] = Query(default=None)):
    """Computes exact 3D Cartesian coordinates of Earth and Mars in heliocentric ecliptic frame."""
    d = target_date or date(2024, 4, 30)
    r_earth, v_earth = planet_state("earth", d)
    r_mars, v_mars = planet_state("mars", d)

    comm = solar_conjunction_and_comm(r_mars, r_earth)

    return {
        "date": d.isoformat(),
        "earth": {
            "position_au": [round(float(x), 5) for x in r_earth],
            "velocity_au_day": [round(float(x), 5) for x in v_earth],
            "distance_to_sun_au": round(float(np.linalg.norm(r_earth)), 5)
        },
        "mars": {
            "position_au": [round(float(x), 5) for x in r_mars],
            "velocity_au_day": [round(float(x), 5) for x in v_mars],
            "distance_to_sun_au": round(float(np.linalg.norm(r_mars)), 5)
        },
        "earth_mars_communication": comm
    }
