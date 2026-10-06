"""Virtual crew + realistic daily logs with the disruptions seen on real missions.

Logs are deterministic per astronaut (fixed seed), so every run of the app
shows the same mission history.
"""
import json
from pathlib import Path

import numpy as np

from app.simulation import params as P

CREW_FILE = Path(__file__).resolve().parents[1] / "data" / "crew.json"


def load_crew() -> dict:
    return json.loads(CREW_FILE.read_text(encoding="utf-8"))


def generate_logs(member: dict, crew_events: list[dict], days: int = P.MISSION_DAYS) -> dict:
    """Daily resistance minutes, cardio minutes, sleep hours and event labels for one astronaut."""
    rng = np.random.default_rng(member["seed"])
    c = member["compliance"]
    res = np.clip(rng.normal(P.PRESCRIBED_RESISTANCE_MIN * c, 6, days), 0, 75)
    cardio = np.clip(rng.normal(P.PRESCRIBED_CARDIO_MIN * c, 6, days), 0, 75)
    sleep = np.clip(rng.normal(member["sleep_mean_h"], 0.5, days), 4, 9)
    events: list[list[str]] = [[] for _ in range(days)]

    # Sick days: 2–3 random days per 30-day month with no exercise
    for month_start in range(0, days, 30):
        span = range(month_start, min(month_start + 30, days))
        for d in rng.choice(list(span), size=min(len(span), int(rng.integers(2, 4))), replace=False):
            res[d] = cardio[d] = 0
            events[d].append("Sick day - no exercise")

    def block(start, length, label):
        return range(start, min(start + length, days)), label

    injury = member.get("injury")
    if injury:
        span, label = block(injury["start_day"], injury["days"], injury["label"])
        for d in span:
            res[d] = 0
            events[d].append(label)

    for ev in crew_events:
        span, label = block(ev["start_day"], ev["days"], ev["label"])
        for d in span:
            if ev["type"] == "equipment_failure":
                res[d] = 0
            elif ev["type"] == "sleep_loss":
                sleep[d] = 5.0
            events[d].append(label)

    return {
        "resistance_min": res.round(1).tolist(),
        "cardio_min": cardio.round(1).tolist(),
        "sleep_h": sleep.round(2).tolist(),
        "events": [" · ".join(e) if e else None for e in events],
    }
