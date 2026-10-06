"""NOAA SWPC solar proton event list (peak >10 MeV flux per event, 1976 → present).

Source: the NCEI copy of the NOAA SPE table. DONKI tells us *that* an event
happened; this list tells us *how strong* it was at Earth.
"""
import html
import re
from datetime import datetime

import httpx

from app.config.settings import settings

_TS = re.compile(r"(\d{4}) (\d{2})/(\d{2}) (\d{4})")


def _ts(text: str) -> datetime | None:
    m = _TS.match(text)
    if not m:
        return None
    y, mo, d, hm = m.groups()
    return datetime(int(y), int(mo), int(d), int(hm[:2]), int(hm[2:]))


def _clean(cell: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", cell))).strip()


def parse(page: str) -> list[dict]:
    """Parse the HTML table into [{start, maximum, peak_pfu, region, location, flare}]."""
    events = []
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", page, re.S | re.I):
        cells = [_clean(c) for c in re.findall(r"<td[^>]*>(.*?)</td>", row, re.S | re.I)]
        if len(cells) < 3:
            continue
        start, maximum = _ts(cells[0]), _ts(cells[1])
        pfu = re.sub(r"[^\d]", "", cells[2])
        if not (start and maximum and pfu):
            continue
        events.append({
            "start": start.isoformat(),
            "maximum": maximum.isoformat(),
            "peak_pfu": int(pfu),
            "region": cells[3] if len(cells) > 3 else None,
            "location": cells[4] if len(cells) > 4 else None,
            "flare": cells[5] if len(cells) > 5 else None,
        })
    return events


async def fetch(client: httpx.AsyncClient) -> list[dict]:
    resp = await client.get(settings.NOAA_SEP_LIST_URL)
    resp.raise_for_status()
    return parse(resp.content.decode("cp1252", errors="replace"))
