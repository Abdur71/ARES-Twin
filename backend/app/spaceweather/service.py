"""Assemble the mission's space weather from DONKI, NOAA and JPL Horizons.

API usage policy:
* one request per source for the whole mission window, all four in parallel;
* every response is cached as JSON under app/data/*_cache/ — windows fully in
  the past are cached forever, the NOAA list for 7 days, recent windows for 1 h;
* the assembled result is memoised in-process, so API calls happen at most once
  per window per server run;
* on network failure the last cached copy is used (reported as "stale-cache"),
  and if nothing is cached the trajectory falls back to an analytic orbit.
"""
import asyncio
from datetime import date, datetime, timedelta

import httpx
import numpy as np

from app.config.settings import settings
from app.simulation import models, params as P
from app.simulation.scenario import Radiation
from app.spaceweather import cache, donki, horizons, noaa

_memo: dict[tuple, dict] = {}
_lock = asyncio.Lock()

NOAA_TTL_S = 7 * 86400
RECENT_TTL_S = 3600


async def _cached(kind: str, key: str, fetcher, ttl_s, offline: bool, source: str):
    entry = cache.read(kind, key, ttl_s)
    if entry and not entry.get("expired"):
        return entry["data"], {"status": "cache", "fetched_at": entry["fetched_at"], "source": source}
    if offline:
        if entry:
            return entry["data"], {"status": "stale-cache", "fetched_at": entry["fetched_at"], "source": source}
        return None, {"status": "unavailable", "source": source, "error": "offline mode and no cached copy"}
    try:
        data = await fetcher()
        entry = cache.write(kind, key, data, source)
        return data, {"status": "live", "fetched_at": entry["fetched_at"], "source": source}
    except (httpx.HTTPError, ValueError, KeyError, IndexError) as exc:
        if entry:
            return entry["data"], {"status": "stale-cache", "fetched_at": entry["fetched_at"], "source": source,
                                   "error": str(exc)}
        return None, {"status": "error", "source": source, "error": str(exc)}


def _combine(statuses: list[dict]) -> dict:
    kinds = {s["status"] for s in statuses}
    if kinds <= {"cache"}:
        status = "cache"
    elif kinds & {"error", "unavailable"}:
        status = "partial" if kinds - {"error", "unavailable"} else "error"
    elif "stale-cache" in kinds:
        status = "stale-cache"
    else:
        status = "live"
    return {"status": status, "requests": len(statuses), "chunks": statuses}


async def _donki_window(client, kind: str, id_key: str, start: date, end: date, ttl, offline: bool, sem):
    """DONKI caps ranges at 60 days: fetch ≤60-day chunks concurrently (max 3 in flight), cache each chunk."""
    async def one(s: str, e: str):
        async with sem:
            return await _cached("donki", f"{kind}_{s}_{e}", lambda: donki.fetch(client, kind, s, e), ttl, offline,
                                 donki.url(kind, s, e))

    results = await asyncio.gather(*(one(s, e) for s, e in donki.chunks(start, end)))
    data = donki.merge_unique([r[0] for r in results], id_key)
    return data, _combine([r[1] for r in results])


async def _fetch_all(start: date, days: int, offline: bool):
    end = start + timedelta(days=days)
    ttl = None if cache.is_historical(end) else RECENT_TTL_S
    sem = asyncio.Semaphore(3)
    transport = httpx.AsyncHTTPTransport(retries=2)
    async with httpx.AsyncClient(timeout=settings.HTTP_TIMEOUT_S, follow_redirects=True, transport=transport,
                                 headers={"User-Agent": "ARES-Twin/0.2 (research prototype)"}) as client:
        return await asyncio.gather(
            _donki_window(client, "SEP", "sepID", start, end, ttl, offline, sem),
            _donki_window(client, "FLR", "flrID", start, end, ttl, offline, sem),
            _cached("noaa", "spe_list", lambda: noaa.fetch(client), NOAA_TTL_S, offline, settings.NOAA_SEP_LIST_URL),
            _cached("horizons", f"earth_{start.isoformat()}_{days}",
                    lambda: horizons.fetch_earth_vectors(client, start, days), ttl, offline,
                    settings.HORIZONS_API_URL),
        )


def assemble(start: date, days: int, sep_raw, flr_raw, noaa_events, earth_xy) -> dict:
    """Merge NOAA magnitudes with de-duplicated DONKI records and place each event on the trajectory."""
    end = start + timedelta(days=days)
    traj = horizons.trajectory(earth_xy or horizons.analytic_earth(start, days), days)
    flare_cls = donki.flare_classes(flr_raw or [])

    in_window = [n for n in (noaa_events or [])
                 if start <= datetime.fromisoformat(n["start"]).date() < end]
    attached: dict[int, list] = {i: [] for i in range(len(in_window))}
    unmatched = []
    for sep in sep_raw or []:
        t = donki.parse_time(sep["eventTime"])
        best, best_gap = None, None
        for i, n in enumerate(in_window):
            lo = datetime.fromisoformat(n["start"]) - timedelta(hours=24)
            hi = datetime.fromisoformat(n["maximum"]) + timedelta(hours=24)
            if lo <= t <= hi:
                gap = abs((t - datetime.fromisoformat(n["start"])).total_seconds())
                if best_gap is None or gap < best_gap:
                    best, best_gap = i, gap
        (attached[best] if best is not None else unmatched).append(sep)

    events = []

    def place(when: datetime, peak_pfu, base: dict):
        day = (when.date() - start).days
        r = traj[day]["r_au"]
        dose_1au = models.spe_dose_from_pfu(peak_pfu) if peak_pfu else 0.0
        level = models.s_scale(peak_pfu) if peak_pfu else 0
        events.append({
            **base,
            "day": day,
            "date": when.date().isoformat(),
            "time": when.isoformat(),
            "peak_pfu": peak_pfu,
            "s_scale": f"S{level}" if level else "below S1",
            "s_level": level,
            "dose_1au_msv": round(dose_1au, 2),
            "r_au": r,
            "dose_at_craft_msv": round(dose_1au / r**2, 2),
            "shelter_default": level >= P.SHELTER_POLICY_MIN_SCALE,
        })

    for i, n in enumerate(in_window):
        group = donki.group_records(attached[i]) if attached[i] else []
        linked = sorted({x for g in group for x in g["linked_ids"]})
        place(datetime.fromisoformat(n["start"]), n["peak_pfu"], {
            "source": "NOAA + DONKI" if group else "NOAA",
            "flare": n.get("flare") or donki.strongest_flare(linked, flare_cls),
            "region": n.get("region"),
            "location": n.get("location"),
            "donki_records": sum(g["records"] for g in group),
            "instruments": sorted({x for g in group for x in g["instruments"]}),
            "links": [g["link"] for g in group if g["link"]],
        })
    for g in donki.group_records(unmatched):
        place(datetime.fromisoformat(g["start"]), None, {
            "source": "DONKI only (below S1 at Earth)",
            "flare": donki.strongest_flare(g["linked_ids"], flare_cls),
            "region": None,
            "location": None,
            "donki_records": g["records"],
            "instruments": g["instruments"],
            "links": [g["link"]] if g["link"] else [],
        })
    events.sort(key=lambda ev: ev["time"])
    for idx, ev in enumerate(events):
        ev["id"] = idx
    return {
        "events": events,
        "trajectory": traj,
        "raw_counts": {"donki_sep_records": len(sep_raw or []), "donki_flares": len(flr_raw or []),
                       "noaa_events_in_window": len(in_window)},
    }


async def mission_spaceweather(start: date | None = None, days: int = P.MISSION_DAYS, refresh: bool = False) -> dict:
    start = start or date.fromisoformat(settings.MISSION_START)
    offline = settings.SPACEWEATHER_OFFLINE
    key = (start, days, offline)
    async with _lock:
        if key in _memo and not refresh:
            return _memo[key]
        if refresh and not cache.is_historical(start + timedelta(days=days)):
            keys = [("horizons", f"earth_{start}_{days}")] + [
                ("donki", f"{kind}_{s}_{e}") for kind in ("SEP", "FLR")
                for s, e in donki.chunks(start, start + timedelta(days=days))]
            for kind, k in keys:
                cache._path(kind, k).unlink(missing_ok=True)
        (sep, s1), (flr, s2), (noaa_ev, s3), (earth, s4) = await _fetch_all(start, days, offline)
        result = assemble(start, days, sep, flr, noaa_ev, earth)
        result.update({
            "mission_start": start.isoformat(),
            "mission_days": days,
            "offline_mode": offline,
            "sources": {"donki_sep": s1, "donki_flr": s2, "noaa_spe_list": s3, "jpl_horizons": s4},
            "trajectory_model": "Horizons Earth ephemeris + Hohmann-type transfer" if earth
            else "Analytic fallback (Horizons unavailable)",
            "dose_map": P.S_SCALE,
        })
        _memo[key] = result
        return result


def radiation_inputs(sw: dict, gcr_scenario: str = P.DEFAULT_GCR_SCENARIO, shelter_overrides: dict | None = None,
                     extra_storms: list[dict] | None = None, days: int = P.MISSION_DAYS) -> Radiation:
    """Per-day GCR + SPE arrays. Several events on one day add; a day is sheltered if any event on it is."""
    gcr = np.full(days, P.GCR_SCENARIOS[gcr_scenario]["transit"])
    sheltered = np.zeros(days, dtype=bool)  # shelter is folded into `spe` below
    unsheltered_part = np.zeros(days)
    sheltered_part = np.zeros(days)
    events = []
    overrides = shelter_overrides or {}
    for ev in sw["events"]:
        d = ev["day"]
        if not 0 <= d < days:
            continue
        shelter = overrides.get(ev["id"], ev["shelter_default"])
        (sheltered_part if shelter else unsheltered_part)[d] += ev["dose_at_craft_msv"]
        events.append({**ev, "sheltered": shelter})
    for storm in extra_storms or []:
        d = int(storm["day"])
        if not 0 <= d < days:
            continue
        r = sw["trajectory"][d]["r_au"]
        dose = models.spe_dose_from_pfu(storm["peak_pfu"]) / r**2
        (sheltered_part if storm["sheltered"] else unsheltered_part)[d] += dose
        level = models.s_scale(storm["peak_pfu"])
        events.append({"id": f"whatif-{d}", "day": d, "peak_pfu": storm["peak_pfu"], "s_scale": f"S{level}",
                       "dose_at_craft_msv": round(dose, 2), "sheltered": storm["sheltered"], "source": "What-if"})
    # Fold mixed days into one effective dose so the engine's single shelter flag stays exact.
    spe = unsheltered_part + sheltered_part * P.SHELTER_FACTOR
    return Radiation(gcr_msv=gcr, spe_msv=spe, sheltered=sheltered, events=events)


def received_dose(ev: dict) -> float:
    return ev["dose_at_craft_msv"] * (P.SHELTER_FACTOR if ev["sheltered"] else 1.0)
