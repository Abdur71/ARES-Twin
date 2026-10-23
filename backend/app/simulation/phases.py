"""Multi-Phase Mars Mission Architecture: Outbound Transit, Mars Surface Stay, and Return Transit.

Conjunction-class mission design based on NASA Design Reference Architecture (DRA 5.0):
- Phase 1: Outbound Transit (Day 0 to 270) — microgravity, deep space GCR, expanding distance & comm delay
- Phase 2: Mars Surface Stay (Day 270 to 770, 500 days) — 0.38g partial gravity, surface GCR, planetary shielding
- Phase 3: Return Transit (Day 770 to 1040, 270 days) — microgravity, deep space GCR, contracting distance
Total: 1040 days.
"""
from dataclasses import dataclass
from typing import Literal
import numpy as np

from app.simulation import params as P


MissionPhaseType = Literal["transit", "outbound", "surface", "return", "full"]


@dataclass
class PhaseConfig:
    name: str
    label: str
    start_day: int
    duration_days: int
    end_day: int
    gravity_g: float
    gcr_type: Literal["transit", "surface"]
    spe_shielding: float
    description: str


PHASES: dict[str, PhaseConfig] = {
    "outbound": PhaseConfig(
        name="outbound",
        label="Outbound Transit",
        start_day=0,
        duration_days=P.MISSION_DAYS,
        end_day=P.MISSION_DAYS,
        gravity_g=0.0,
        gcr_type="transit",
        spe_shielding=1.0,
        description="270-day interplanetary cruise from Earth departure to Mars orbit insertion in microgravity."
    ),
    "surface": PhaseConfig(
        name="surface",
        label="Mars Surface Stay",
        start_day=P.MISSION_DAYS,
        duration_days=P.SURFACE_STAY_DAYS,
        end_day=P.MISSION_DAYS + P.SURFACE_STAY_DAYS,
        gravity_g=P.GRAVITY_MARS,
        gcr_type="surface",
        spe_shielding=P.SURFACE_SPE_SHIELDING,
        description="500-day science expedition on the Martian surface under 0.38g partial gravity."
    ),
    "return": PhaseConfig(
        name="return",
        label="Return Transit",
        start_day=P.MISSION_DAYS + P.SURFACE_STAY_DAYS,
        duration_days=P.RETURN_DAYS,
        end_day=P.TOTAL_CONJUNCTION_DAYS,
        gravity_g=0.0,
        gcr_type="transit",
        spe_shielding=1.0,
        description="270-day homeward interplanetary cruise from Mars departure to Earth arrival in microgravity."
    ),
}

# Alias "transit" to "outbound" for backward compatibility
PHASES["transit"] = PHASES["outbound"]


def get_phase_at_day(day: int) -> PhaseConfig:
    """Return the active mission phase config for a given mission day (0 to 1040)."""
    d = max(0, min(day, P.TOTAL_CONJUNCTION_DAYS - 1))
    if d < P.MISSION_DAYS:
        return PHASES["outbound"]
    elif d < P.MISSION_DAYS + P.SURFACE_STAY_DAYS:
        return PHASES["surface"]
    else:
        return PHASES["return"]


def generate_mission_environment(phase: MissionPhaseType = "full", gcr_scenario: str = P.DEFAULT_GCR_SCENARIO):
    """Generate day-by-day environmental vectors (gravity, GCR, SPE attenuation, AU distance, comm delay).
    
    Returns vectors of length corresponding to the selected phase (270, 500, or 1040 days).
    """
    gcr_spec = P.GCR_SCENARIOS[gcr_scenario]
    
    if phase in ("outbound", "transit"):
        days = P.MISSION_DAYS
        t = np.linspace(0, 1, days)
        # Hohmann ellipse radius from 1.0 AU to 1.52 AU
        r_au = 1.0 + 0.52 * np.sin(t * np.pi / 2) ** 2
        earth_dist = 0.52 * t
        comm_delay = earth_dist * 499.0 / 60.0  # speed of light delay in minutes
        gravity = np.zeros(days)
        gcr = np.full(days, gcr_spec["transit"])
        spe_attenuation = np.ones(days)
        phase_labels = ["outbound"] * days
        start_day_offset = 0

    elif phase == "surface":
        days = P.SURFACE_STAY_DAYS
        r_au = np.full(days, 1.52)
        # Earth-Mars synodic distance oscillation across 500 days (approx 780-day synodic period)
        synodic_phase = np.linspace(0, 500 / 780.0 * 2 * np.pi, days)
        earth_dist = 1.5 - 0.9 * np.cos(synodic_phase)
        comm_delay = np.clip(earth_dist * 499.0 / 60.0, 3.5, 21.5)
        gravity = np.full(days, P.GRAVITY_MARS)
        gcr = np.full(days, gcr_spec["surface"])
        spe_attenuation = np.full(days, P.SURFACE_SPE_SHIELDING)
        phase_labels = ["surface"] * days
        start_day_offset = P.MISSION_DAYS

    elif phase == "return":
        days = P.RETURN_DAYS
        t = np.linspace(1, 0, days)
        r_au = 1.0 + 0.52 * np.sin(t * np.pi / 2) ** 2
        earth_dist = 0.52 * t
        comm_delay = earth_dist * 499.0 / 60.0
        gravity = np.zeros(days)
        gcr = np.full(days, gcr_spec["transit"])
        spe_attenuation = np.ones(days)
        phase_labels = ["return"] * days
        start_day_offset = P.MISSION_DAYS + P.SURFACE_STAY_DAYS

    else:  # "full" 1040-day conjunction mission
        days = P.TOTAL_CONJUNCTION_DAYS
        out_env = generate_mission_environment("outbound", gcr_scenario)
        surf_env = generate_mission_environment("surface", gcr_scenario)
        ret_env = generate_mission_environment("return", gcr_scenario)
        
        r_au = np.concatenate([out_env["r_au"], surf_env["r_au"], ret_env["r_au"]])
        earth_dist = np.concatenate([out_env["earth_dist_au"], surf_env["earth_dist_au"], ret_env["earth_dist_au"]])
        comm_delay = np.concatenate([out_env["comm_delay_min"], surf_env["comm_delay_min"], ret_env["comm_delay_min"]])
        gravity = np.concatenate([out_env["gravity_g"], surf_env["gravity_g"], ret_env["gravity_g"]])
        gcr = np.concatenate([out_env["gcr_msv"], surf_env["gcr_msv"], ret_env["gcr_msv"]])
        spe_attenuation = np.concatenate([out_env["spe_attenuation"], surf_env["spe_attenuation"], ret_env["spe_attenuation"]])
        phase_labels = out_env["phase_labels"] + surf_env["phase_labels"] + ret_env["phase_labels"]
        start_day_offset = 0

    return {
        "days": days,
        "phase": phase,
        "start_day_offset": start_day_offset,
        "r_au": np.round(r_au, 4),
        "earth_dist_au": np.round(earth_dist, 4),
        "comm_delay_min": np.round(comm_delay, 2),
        "gravity_g": gravity,
        "gcr_msv": gcr,
        "spe_attenuation": spe_attenuation,
        "phase_labels": phase_labels,
    }


def phases_manifest() -> dict:
    """Manifest describing all phases for frontend and API exploration."""
    return {
        "total_mission_days": P.TOTAL_CONJUNCTION_DAYS,
        "conjunction_profile": {
            "outbound_days": P.MISSION_DAYS,
            "surface_stay_days": P.SURFACE_STAY_DAYS,
            "return_days": P.RETURN_DAYS,
        },
        "phases": {
            k: {
                "name": v.name,
                "label": v.label,
                "start_day": v.start_day,
                "duration_days": v.duration_days,
                "end_day": v.end_day,
                "gravity_g": v.gravity_g,
                "gcr_type": v.gcr_type,
                "spe_shielding": v.spe_shielding,
                "description": v.description,
            }
            for k, v in PHASES.items() if k != "transit"
        }
    }
