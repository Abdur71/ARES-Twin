"""On-disk JSON cache so the demo works offline and never hits rate limits.

Responses for fully historical windows never change, so they are kept forever;
anything that touches recent dates expires after `ttl_s`.
"""
import json
import re
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[1] / "data"


def _path(kind: str, key: str) -> Path:
    safe = re.sub(r"[^A-Za-z0-9_.-]", "_", key)
    return DATA_DIR / f"{kind}_cache" / f"{safe}.json"


def is_historical(end: date, margin_days: int = 7) -> bool:
    return end < date.today() - timedelta(days=margin_days)


def read(kind: str, key: str, ttl_s: float | None = None) -> dict | None:
    """Cached entry {fetched_at, source, data}, or None if missing / expired (ttl_s=None → never expires)."""
    path = _path(kind, key)
    if not path.exists():
        return None
    try:
        entry = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if ttl_s is not None:
        age = datetime.now(timezone.utc) - datetime.fromisoformat(entry["fetched_at"])
        if age.total_seconds() > ttl_s:
            entry["expired"] = True
    return entry


def write(kind: str, key: str, data, source: str) -> dict:
    path = _path(kind, key)
    path.parent.mkdir(parents=True, exist_ok=True)
    entry = {"fetched_at": datetime.now(timezone.utc).isoformat(), "source": source, "data": data}
    path.write_text(json.dumps(entry, indent=1), encoding="utf-8")
    return entry
