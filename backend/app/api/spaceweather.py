"""Space weather, mission clock and model registry."""
from datetime import date, timedelta

from fastapi import APIRouter, Query

from app.api.deps import mission_day
from app.config.settings import settings
from app.simulation import params as P
from app.spaceweather.service import mission_spaceweather

router = APIRouter(tags=["Mission"])


@router.get("/spaceweather")
async def spaceweather(refresh: bool = Query(False, description="Bypass the in-process memo and re-check sources")):
    """Real solar events for the replay window, the spacecraft trajectory and the status of every data source."""
    return await mission_spaceweather(refresh=refresh)


@router.get("/mission")
async def mission(day: int | None = Query(None)):
    """Mission clock: replay dates, current day, distance from the Sun and comm delay."""
    d = mission_day(day)
    sw = await mission_spaceweather()
    start = date.fromisoformat(sw["mission_start"])
    point = sw["trajectory"][d]
    return {
        "mission_start": sw["mission_start"],
        "mission_days": P.MISSION_DAYS,
        "current_day": d,
        "default_day": settings.MISSION_CURRENT_DAY,
        "current_date": (start + timedelta(days=d)).isoformat(),
        "arrival_date": (start + timedelta(days=P.MISSION_DAYS)).isoformat(),
        "r_au": point["r_au"],
        "earth_distance_au": point["earth_distance_au"],
        "comm_delay_min": point["comm_delay_min"],
        "events_so_far": sum(1 for e in sw["events"] if e["day"] < d and e["s_level"] >= 1),
        "sources": {k: v["status"] for k, v in sw["sources"].items()},
        "offline_mode": sw["offline_mode"],
    }


@router.get("/model")
def model():
    """Equations, parameter table, readiness limits/weights and the SPE dose map (for the About page)."""
    return {
        "parameters": P.registry(),
        "readiness": {"limits": P.LOSS_LIMITS, "weights": P.WEIGHTS, "green_min": P.GREEN_MIN,
                      "amber_min": P.AMBER_MIN, "subscore_cap": P.SUBSCORE_CAP},
        "gcr_scenarios": P.GCR_SCENARIOS,
        "dose_map": P.S_SCALE,
        "shelter_factor": P.SHELTER_FACTOR,
        "prescription": {"resistance_min": P.PRESCRIBED_RESISTANCE_MIN, "cardio_min": P.PRESCRIBED_CARDIO_MIN},
        "monte_carlo_runs": P.MC_RUNS,
        "equations": {
            "compliance": "c_t = min(1, minutes done / minutes prescribed)",
            "bone": "BMD_{t+1} = BMD_t × (1 − r_bone/30 × [1 + k_bone(1 − c_res)] × g)",
            "muscle": "M_{t+1} = M_t × (1 − [c_res · r_ex · σ_sleep + (1 − c_res) · r_none])",
            "cardio": "V_{t+1} = V_t − λ(1 − 0.7 c_cardio)(V_t − V_floor)",
            "radiation": "D_{t+1} = D_t + d_GCR + E_SPE × (1 AU / r)² × s_shelter",
            "subscore": "S_i = max(0, 1 − (loss_i / limit_i)²)",
            "readiness": "100 × (0.35 S_bone + 0.35 S_muscle + 0.30 S_cardio)",
        },
    }
