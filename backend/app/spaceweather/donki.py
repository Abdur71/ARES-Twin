"""NASA CCMC DONKI client (solar particle events and flares).

DONKI moved on 2026-09-30 to https://ccmc.gsfc.nasa.gov/DONKI-API/get/...; no
API key is required. DONKI files one SEP record *per instrument*, so a single
storm appears several times — see `group_records`.
"""
from datetime import date, datetime, timedelta

import httpx

from app.config.settings import settings

FLARE_RANK = {"A": 0, "B": 1, "C": 2, "M": 3, "X": 4}
MAX_RANGE_DAYS = 60  # the new DONKI-API rejects longer ranges with HTTP 400


def url(kind: str, start: str, end: str) -> str:
    base = f"{settings.DONKI_API_BASE}/{kind}?startDate={start}&endDate={end}"
    if settings.NASA_API_KEY and settings.NASA_API_KEY != "DEMO_KEY":
        base += f"&api_key={settings.NASA_API_KEY}"
    return base


def chunks(start: date, end: date, max_days: int = MAX_RANGE_DAYS) -> list[tuple[str, str]]:
    """Split [start, end] into inclusive ranges no longer than `max_days` days."""
    out, cur = [], start
    while cur <= end:
        stop = min(end, cur + timedelta(days=max_days - 1))
        out.append((cur.isoformat(), stop.isoformat()))
        cur = stop + timedelta(days=1)
    return out


async def fetch(client: httpx.AsyncClient, kind: str, start: str, end: str) -> list:
    """One request for a ≤60-day range."""
    resp = await client.get(url(kind, start, end))
    resp.raise_for_status()
    return resp.json() if resp.content else []


def merge_unique(parts: list[list], id_key: str) -> list:
    """Concatenate chunk results, dropping records repeated across chunk boundaries."""
    seen, out = set(), []
    for part in parts:
        for rec in part or []:
            rid = rec.get(id_key)
            if rid not in seen:
                seen.add(rid)
                out.append(rec)
    return out


def parse_time(s: str) -> datetime:
    return datetime.strptime(s.rstrip("Z"), "%Y-%m-%dT%H:%M")


def flare_sort_key(cls: str | None) -> float:
    """'X3.9' → 4.39 so flare classes can be compared."""
    if not cls or cls[0] not in FLARE_RANK:
        return -1.0
    try:
        return FLARE_RANK[cls[0]] + float(cls[1:] or 0) / 10
    except ValueError:
        return float(FLARE_RANK[cls[0]])


def _record(sep: dict) -> dict:
    return {
        "id": sep.get("sepID"),
        "time": parse_time(sep["eventTime"]),
        "instruments": [i.get("displayName") for i in sep.get("instruments") or []],
        "linked": {e["activityID"] for e in sep.get("linkedEvents") or []},
        "link": sep.get("link"),
    }


def group_records(seps: list, window_h: float = 24.0) -> list[dict]:
    """De-duplicate SEP records: union records that share a linked flare/CME ID or occur within `window_h`."""
    recs = sorted((_record(s) for s in seps), key=lambda r: r["time"])
    parent = list(range(len(recs)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i in range(len(recs)):
        for j in range(i + 1, len(recs)):
            close = recs[j]["time"] - recs[i]["time"] <= timedelta(hours=window_h)
            if close or (recs[i]["linked"] & recs[j]["linked"]):
                parent[find(j)] = find(i)

    groups: dict[int, list] = {}
    for i, r in enumerate(recs):
        groups.setdefault(find(i), []).append(r)
    return [summarise(g) for g in sorted(groups.values(), key=lambda g: g[0]["time"])]


def summarise(records: list[dict]) -> dict:
    records = sorted(records, key=lambda r: r["time"])
    return {
        "start": records[0]["time"].isoformat(),
        "records": len(records),
        "sep_ids": [r["id"] for r in records],
        "instruments": sorted({i for r in records for i in r["instruments"]}),
        "linked_ids": sorted({x for r in records for x in r["linked"]}),
        "link": records[0]["link"],
    }


def flare_classes(flares: list) -> dict:
    """flrID → classType, for labelling events with their linked flare."""
    return {f["flrID"]: f.get("classType") for f in flares if f.get("flrID")}


def strongest_flare(linked_ids: list[str], classes: dict) -> str | None:
    found = [classes[i] for i in linked_ids if i in classes and classes[i]]
    return max(found, key=flare_sort_key) if found else None
