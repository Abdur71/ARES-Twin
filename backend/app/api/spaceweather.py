from datetime import date, timedelta
import httpx
from fastapi import APIRouter, Query

from app.api.deps import mission_day
from app.config.settings import settings
from app.simulation import params as P
from app.spaceweather import cache, donki
from app.spaceweather.service import mission_spaceweather

router = APIRouter(tags=["Mission"])


@router.get("/donki/test")
async def donki_test(
    startDate: str = Query("2026-01-01", description="Start date (YYYY-MM-DD)"),
    endDate: str = Query("2026-01-31", description="End date (YYYY-MM-DD)"),
    kind: str = Query("SEP", description="SEP or FLR")
):
    """Directly test the NASA CCMC DONKI endpoint with the configured NASA_API_KEY."""
    target_url = donki.url(kind, startDate, endDate)
    cached_entry = cache.read("donki", f"{kind}_{startDate}_{endDate}")
    
    live_data = None
    live_error = None
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(target_url)
            if resp.status_code == 200:
                live_data = resp.json()
    except Exception as exc:
        live_error = str(exc)
        
    records = live_data if live_data is not None else (cached_entry["data"] if cached_entry else [])
    
    return {
        "status": "connected" if (live_data is not None or cached_entry) else "offline",
        "api_key_configured": bool(settings.NASA_API_KEY and settings.NASA_API_KEY != "DEMO_KEY"),
        "target_url": target_url,
        "is_live": live_data is not None,
        "live_error": live_error,
        "source": "live_api" if live_data is not None else ("local_donki_cache" if cached_entry else "none"),
        "record_count": len(records),
        "sample_records": records[:3],
        "all_records": records
    }


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
        "readiness": {"limits": P.LOSS_LIMITS, "weights": P.WEIGHTS, "weights_expanded": P.WEIGHTS_EXPANDED,
                      "green_min": P.GREEN_MIN, "amber_min": P.AMBER_MIN, "subscore_cap": P.SUBSCORE_CAP},
        "gcr_scenarios": P.GCR_SCENARIOS,
        "dose_map": P.S_SCALE,
        "shelter_factor": P.SHELTER_FACTOR,
        "prescription": {"resistance_min": P.PRESCRIBED_RESISTANCE_MIN, "cardio_min": P.PRESCRIBED_CARDIO_MIN},
        "monte_carlo_runs": P.MC_RUNS,
        "mission_phases": {
            "outbound_days": P.MISSION_DAYS,
            "surface_stay_days": P.SURFACE_STAY_DAYS,
            "return_days": P.RETURN_DAYS,
            "total_conjunction_days": P.TOTAL_CONJUNCTION_DAYS,
            "mars_gravity_g": P.GRAVITY_MARS,
        },
        "equations": {
            "compliance": "c_t = min(1, minutes done / minutes prescribed)",
            "bone": "BMD_{t+1} = BMD_t × (1 − r_bone/30 × [1 + k_bone(1 − c_res)] × g_unloading)",
            "muscle": "M_{t+1} = M_t × (1 − [c_res · r_ex · σ_sleep + (1 − c_res) · r_none] × g_unloading)",
            "strength": "S_{t+1} = S_t × (1 − [r_neural(1 − 0.85 c_res) + 1.25 ΔM_daily] × g_unloading)",
            "cardio": "V_{t+1} = V_t − λ(1 − 0.7 c_cardio)(V_t − V_floor)",
            "sleep_debt": "Debt_{t+1} = max(0, Debt_t × (1 − 0.15) + (8.0 − sleep_h))",
            "kidney_stone": "RR = (Ca_urine / 180)^1.8 × hydration^-1.5; Ca_urine = 180 + 1600 × bone_loss",
            "sans_onsd": "ONSD_t = 5.1 + 1.1 × (1 − e^(-t / 45)) × (1 − g)",
            "mars_gravity": "g_unloading = 1.0 (transit, 0g) | 0.62 (Mars surface, 0.38g) | 0.0 (Earth, 1g)",
            "radiation": "D_{t+1} = D_t + d_GCR + E_SPE × (1 AU / r)² × s_shelter × s_surface",
            "subscore": "S_i = max(0, 1 − (loss_i / limit_i)²)",
            "readiness": "100 × (0.35 S_bone + 0.35 S_muscle + 0.30 S_cardio)",
        },
    }
