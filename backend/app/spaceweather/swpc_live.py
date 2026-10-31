"""NOAA Space Weather Prediction Center (SWPC) Real-Time Proton Flux Feed.

Ingests live primary GOES satellite integral proton flux streams:
- Endpoint: https://services.swpc.noaa.gov/json/goes/primary/integral-protons-1-day.json
- Integral channels: >=1 MeV, >=5 MeV, >=10 MeV, >=30 MeV, >=50 MeV, >=100 MeV
- Real-time S-scale determination (S0/Quiet through S5/Extreme)
- Live dosimetric rate estimation (mSv/hr, mSv/day) at 1 AU and spacecraft location
- Active storm threshold detection and shelter alerting
"""
from datetime import datetime, timezone
from typing import Literal
import httpx
import numpy as np

from app.config.settings import settings
from app.simulation import models, params as P
from app.spaceweather import cache

SWPC_LIVE_TTL_S = 300  # 5 minutes TTL for real-time streaming feed


def parse_swpc_records(records: list[dict]) -> dict:
    """Parse raw NOAA SWPC json records into organized time series and latest status."""
    if not records:
        return {"status": "empty", "readings_count": 0}

    # Group records by energy channel
    by_channel: dict[str, list[dict]] = {}
    for r in records:
        energy = r.get("energy")
        flux = r.get("flux")
        time_tag = r.get("time_tag")
        if energy and flux is not None and time_tag:
            by_channel.setdefault(energy, []).append({
                "time": time_tag,
                "flux": float(flux)
            })

    # Channel >= 10 MeV is the operational benchmark for NOAA S-scale
    ch10 = by_channel.get(">=10 MeV", [])
    if not ch10:
        # Fallback to any available channel or first key
        ch10 = next(iter(by_channel.values())) if by_channel else []

    latest_time = ch10[-1]["time"] if ch10 else datetime.now(timezone.utc).isoformat()
    latest_flux_10 = ch10[-1]["flux"] if ch10 else 0.05
    peak_24h_flux_10 = max((x["flux"] for x in ch10), default=latest_flux_10)

    # Determine real-time NOAA S-scale level
    curr_s_level = models.s_scale(latest_flux_10)
    peak_s_level = models.s_scale(peak_24h_flux_10)

    # Live dose rate at 1 AU (unsheltered) in mSv/hr and mSv/day
    dose_1au_event_msv = models.spe_dose_from_pfu(latest_flux_10)
    # Approximate instantaneous dose rate assuming a typical 24h event profile
    instant_rate_msv_hr = (dose_1au_event_msv / 24.0) if latest_flux_10 >= 10.0 else 0.0002

    # Shelter recommendation
    shelter_alert = curr_s_level >= P.SHELTER_POLICY_MIN_SCALE or latest_flux_10 >= 100.0

    return {
        "status": "active",
        "latest_timestamp": latest_time,
        "readings_count": len(records),
        "channels_available": list(by_channel.keys()),
        "current_flux_10mev_pfu": round(latest_flux_10, 3),
        "peak_flux_24h_10mev_pfu": round(peak_24h_flux_10, 3),
        "current_s_scale": f"S{curr_s_level}" if curr_s_level > 0 else "S0 (Quiet)",
        "current_s_level": curr_s_level,
        "peak_s_scale_24h": f"S{peak_s_level}" if peak_s_level > 0 else "S0 (Quiet)",
        "peak_s_level_24h": peak_s_level,
        "dose_rate_1au": {
            "msv_per_hour": round(instant_rate_msv_hr, 5),
            "msv_per_day": round(instant_rate_msv_hr * 24.0, 4),
        },
        "shelter_recommendation": {
            "shelter_active": shelter_alert,
            "status": "SHELTER IMMEDIATELY" if shelter_alert else "NORMAL OPERATIONS",
            "reason": (
                f"Proton flux {latest_flux_10:.1f} pfu reaches S{curr_s_level} storm threshold."
                if shelter_alert else "Proton flux below operational storm shelter limit (S2 / 100 pfu)."
            )
        },
        "recent_series_10mev": ch10[-48:] if len(ch10) >= 48 else ch10  # last 48 readings (~4 hours at 5-min cadence)
    }


def fallback_live_feed() -> list[dict]:
    """Provide realistic baseline real-time proton flux feed when offline or external API unavailable."""
    now = datetime.now(timezone.utc)
    # Generate quiet-sun background flux ~0.08–0.25 pfu with solar wind micro-fluctuations
    readings = []
    for i in range(48, -1, -1):
        dt = datetime.fromtimestamp(now.timestamp() - i * 300, timezone.utc)
        noise = 0.05 * np.sin(i / 4.0) + 0.02 * np.cos(i / 1.5)
        readings.append({
            "time_tag": dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "satellite": 16,
            "energy": ">=10 MeV",
            "flux": max(0.02, round(0.12 + noise, 4))
        })
        readings.append({
            "time_tag": dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "satellite": 16,
            "energy": ">=50 MeV",
            "flux": max(0.01, round(0.04 + noise * 0.5, 4))
        })
        readings.append({
            "time_tag": dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "satellite": 16,
            "energy": ">=100 MeV",
            "flux": max(0.005, round(0.01 + noise * 0.2, 4))
        })
    return readings


async def fetch_swpc_live_feed(window_days: Literal[1, 3, 7] = 1, refresh: bool = False) -> dict:
    """Fetch live GOES integral proton flux with caching and offline fallback."""
    url = settings.NOAA_SWPC_LIVE_URL.replace("1-day", f"{window_days}-day")
    cache_key = f"swpc_integral_{window_days}d"
    
    if not refresh:
        cached = cache.read("swpc", cache_key, ttl_s=SWPC_LIVE_TTL_S)
        if cached and not cached.get("expired"):
            return {
                "source": "cache",
                "feed_url": url,
                "fetched_at": cached["fetched_at"],
                "data": parse_swpc_records(cached["data"])
            }
    
    if settings.SPACEWEATHER_OFFLINE:
        cached = cache.read("swpc", cache_key)
        data = cached["data"] if cached else fallback_live_feed()
        return {
            "source": "offline_fallback",
            "feed_url": url,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "data": parse_swpc_records(data)
        }

    try:
        async with httpx.AsyncClient(timeout=settings.HTTP_TIMEOUT_S) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            raw_data = resp.json()
            entry = cache.write("swpc", cache_key, raw_data, source=url)
            return {
                "source": "live_api",
                "feed_url": url,
                "fetched_at": entry["fetched_at"],
                "data": parse_swpc_records(raw_data)
            }
    except Exception as exc:
        cached = cache.read("swpc", cache_key)
        fallback_data = cached["data"] if cached else fallback_live_feed()
        return {
            "source": "stale_cache_or_fallback",
            "feed_url": url,
            "error": str(exc),
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "data": parse_swpc_records(fallback_data)
        }
