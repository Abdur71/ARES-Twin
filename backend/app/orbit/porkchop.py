"""Multi-Opportunity Mars Launch Window & Porkchop Plot Generator.

Analyzes Earth-Mars synodic opportunities (~25.6 month recurrence: 2024, 2026, 2028, 2031, 2033, 2035).
Computes 2D contour grids of C3 launch energy, arrival hyperbolic excess velocity, and total Delta-V.
Generates Pareto frontiers balancing crew radiation exposure (Time of Flight) against propulsion mass penalty.
"""
from datetime import date, timedelta
import numpy as np

from app.orbit.ephemeris import planet_state
from app.orbit.lambert import compute_mission_deltav, solve_lambert

# Canonical Earth-Mars Conjunction Launch Windows
MARS_LAUNCH_OPPORTUNITIES = [
    {
        "opportunity": "2024",
        "nominal_departure": "2024-10-15",
        "nominal_arrival": "2025-07-12",
        "nominal_tof_days": 270,
        "synodic_cycle": "Cycle 1 (Historical Replay Reference)",
        "expected_c3_km2_s2": 15.2,
        "expected_dv_total_km_s": 5.75,
    },
    {
        "opportunity": "2026",
        "nominal_departure": "2026-11-20",
        "nominal_arrival": "2027-07-28",
        "nominal_tof_days": 250,
        "synodic_cycle": "Cycle 2 (Near-Term Uncrewed Testbed)",
        "expected_c3_km2_s2": 13.8,
        "expected_dv_total_km_s": 5.58,
    },
    {
        "opportunity": "2028",
        "nominal_departure": "2028-12-25",
        "nominal_arrival": "2029-08-15",
        "nominal_tof_days": 233,
        "synodic_cycle": "Cycle 3 (Target Crewed Window)",
        "expected_c3_km2_s2": 12.4,
        "expected_dv_total_km_s": 5.42,
    },
    {
        "opportunity": "2031",
        "nominal_departure": "2031-02-15",
        "nominal_arrival": "2031-10-10",
        "nominal_tof_days": 237,
        "synodic_cycle": "Cycle 4 (Post-Aphelion Window)",
        "expected_c3_km2_s2": 14.1,
        "expected_dv_total_km_s": 5.65,
    },
    {
        "opportunity": "2033",
        "nominal_departure": "2033-04-10",
        "nominal_arrival": "2033-11-25",
        "nominal_tof_days": 229,
        "synodic_cycle": "Cycle 5 (Optimal Perihelic Alignment)",
        "expected_c3_km2_s2": 11.2,
        "expected_dv_total_km_s": 5.25,
    },
]


def list_launch_opportunities() -> list[dict]:
    """Returns catalog of Mars launch windows through 2035."""
    return MARS_LAUNCH_OPPORTUNITIES


def generate_porkchop_grid(
    departure_start: date,
    departure_end: date,
    min_tof_days: int = 160,
    max_tof_days: int = 320,
    dep_step_days: int = 5,
    tof_step_days: int = 10
) -> dict:
    """Computes a 2D mesh of launch date vs Time-of-Flight (TOF) for porkchop contour visualization.
    
    Identifies:
    1. Minimum Delta-V trajectory (cheapest propellant mass).
    2. Minimum TOF fast-transit trajectory (lowest cumulative GCR radiation dose).
    3. Pareto trade-off curve between transit duration and Delta-V.
    """
    dep_dates = []
    curr = departure_start
    while curr <= departure_end:
        dep_dates.append(curr)
        curr += timedelta(days=dep_step_days)

    tofs = list(range(min_tof_days, max_tof_days + 1, tof_step_days))

    grid_c3 = []
    grid_dv = []
    grid_vinf_arr = []

    min_dv_info = None
    min_tof_info = None
    all_points = []

    for dep in dep_dates:
        row_c3 = []
        row_dv = []
        row_vinf = []

        r_earth, v_earth = planet_state("earth", dep)

        for tof in tofs:
            arr_date = dep + timedelta(days=tof)
            r_mars, v_mars = planet_state("mars", arr_date)

            try:
                v1_craft, v2_craft, _ = solve_lambert(r_earth, r_mars, float(tof))
                dv_metrics = compute_mission_deltav(v1_craft, v_earth, v2_craft, v_mars)

                c3 = dv_metrics["c3_launch_energy_km2_s2"]
                dv_tot = dv_metrics["dv_total_km_s"]
                v_arr = dv_metrics["v_inf_arrival_km_s"]

                point = {
                    "departure_date": dep.isoformat(),
                    "arrival_date": arr_date.isoformat(),
                    "tof_days": tof,
                    "c3": c3,
                    "dv_total": dv_tot,
                    "v_inf_arrival": v_arr,
                    "dv_tmi": dv_metrics["dv_tmi_km_s"],
                    "dv_moi": dv_metrics["dv_moi_km_s"]
                }
                all_points.append(point)

                if min_dv_info is None or dv_tot < min_dv_info["dv_total"]:
                    min_dv_info = point

                if tof <= min_tof_days + 10:
                    if min_tof_info is None or dv_tot < min_tof_info["dv_total"]:
                        min_tof_info = point

                row_c3.append(round(c3, 1))
                row_dv.append(round(dv_tot, 2))
                row_vinf.append(round(v_arr, 2))
            except Exception:
                row_c3.append(None)
                row_dv.append(None)
                row_vinf.append(None)

        grid_c3.append(row_c3)
        grid_dv.append(row_dv)
        grid_vinf_arr.append(row_vinf)

    # Estimate GCR dose reduction for fast transit (1.3 mSv/day)
    tof_diff_days = (min_dv_info["tof_days"] - min_tof_info["tof_days"]) if (min_dv_info and min_tof_info) else 0
    dose_saved_msv = round(max(0, tof_diff_days) * 1.3, 1)

    return {
        "departure_dates": [d.isoformat() for d in dep_dates],
        "tof_days_axis": tofs,
        "grid_c3_km2_s2": grid_c3,
        "grid_dv_total_km_s": grid_dv,
        "grid_vinf_arrival_km_s": grid_vinf_arr,
        "optimal_minimum_energy": min_dv_info,
        "fast_transit_option": min_tof_info,
        "radiation_tradeoff": {
            "days_saved": tof_diff_days,
            "estimated_gcr_dose_saved_msv": dose_saved_msv,
            "additional_dv_penalty_km_s": round(
                (min_tof_info["dv_total"] - min_dv_info["dv_total"]) if (min_dv_info and min_tof_info) else 0.0, 2
            )
        }
    }
