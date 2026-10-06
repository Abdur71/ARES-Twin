"""JPL Horizons client + nominal Earth→Mars transfer trajectory.

Horizons gives Earth's real heliocentric position for every mission day. The
spacecraft flies a Hohmann-type ellipse whose perihelion is Earth's departure
position, stretched to the mission length. From these we get the spacecraft's
distance from the Sun (to scale SPE dose) and the one-way light-time delay to Earth.
"""
import math
from datetime import date, timedelta

import httpx

from app.config.settings import settings

AU_LIGHT_MIN = 8.316746  # light-minutes per AU
R_EARTH_AU = 1.0
R_MARS_AU = 1.5237


async def fetch_earth_vectors(client: httpx.AsyncClient, start: date, days: int) -> list[list[float]]:
    """Earth heliocentric ecliptic [x, y] in AU, one row per day (single request for the whole window)."""
    params = {
        "format": "json", "COMMAND": "'399'", "OBJ_DATA": "'NO'", "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'VECTORS'", "CENTER": "'500@10'", "REF_PLANE": "'ECLIPTIC'",
        "START_TIME": f"'{start.isoformat()}'", "STOP_TIME": f"'{(start + timedelta(days=days)).isoformat()}'",
        "STEP_SIZE": "'1d'", "VEC_TABLE": "'1'", "OUT_UNITS": "'AU-D'", "CSV_FORMAT": "'YES'",
    }
    resp = await client.get(settings.HORIZONS_API_URL, params=params)
    resp.raise_for_status()
    return parse_vectors(resp.json()["result"])


def parse_vectors(result: str) -> list[list[float]]:
    body = result.split("$$SOE", 1)[1].split("$$EOE", 1)[0]
    rows = []
    for line in body.strip().splitlines():
        parts = [p.strip() for p in line.split(",")]
        if len(parts) >= 5:
            rows.append([float(parts[2]), float(parts[3])])
    return rows


def analytic_earth(start: date, days: int) -> list[list[float]]:
    """Offline fallback: circular 1 AU orbit (Earth's longitude ≈ 100° on 1 Jan)."""
    lon0 = math.radians(100.0 + (start - date(start.year, 1, 1)).days * 360 / 365.25)
    w = 2 * math.pi / 365.25
    return [[math.cos(lon0 + w * d), math.sin(lon0 + w * d)] for d in range(days + 1)]


def _true_anomaly(mean_anomaly: float, e: float) -> float:
    E = mean_anomaly
    for _ in range(50):  # Newton iteration on Kepler's equation
        E -= (E - e * math.sin(E) - mean_anomaly) / (1 - e * math.cos(E))
    return 2 * math.atan2(math.sqrt(1 + e) * math.sin(E / 2), math.sqrt(1 - e) * math.cos(E / 2))


def trajectory(earth_xy: list[list[float]], days: int) -> list[dict]:
    """Per-day spacecraft distance from the Sun and one-way comm delay to Earth."""
    a = (R_EARTH_AU + R_MARS_AU) / 2
    e = (R_MARS_AU - R_EARTH_AU) / (R_MARS_AU + R_EARTH_AU)
    lon0 = math.atan2(earth_xy[0][1], earth_xy[0][0])
    out = []
    for d in range(days + 1):
        nu = _true_anomaly(math.pi * d / days, e)
        r = a * (1 - e**2) / (1 + e * math.cos(nu))
        sx, sy = r * math.cos(lon0 + nu), r * math.sin(lon0 + nu)
        ex, ey = earth_xy[min(d, len(earth_xy) - 1)]
        dist = math.hypot(sx - ex, sy - ey)
        out.append({"day": d, "r_au": round(r, 4), "earth_distance_au": round(dist, 4),
                    "comm_delay_min": round(dist * AU_LIGHT_MIN, 2)})
    return out
