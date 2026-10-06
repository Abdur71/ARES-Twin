"""Turn logged history + a forward plan into the per-day inputs the engine runs on."""
from dataclasses import dataclass, field

import numpy as np

from app.simulation import models, params as P
from app.simulation.simulate import DailyInputs


@dataclass
class Plan:
    """Behaviour assumed from the current day to arrival."""

    resistance_days: int = 7  # sessions per week (0–7)
    cardio_min: float = P.PRESCRIBED_CARDIO_MIN  # per day (0–60)
    sleep_h: float = 7.0
    adherence: float = 1.0  # share of the plan actually done
    injury_start: int | None = None  # mission day; no resistance exercise during the block
    injury_days: int = 0


@dataclass
class Radiation:
    gcr_msv: np.ndarray  # (days,)
    spe_msv: np.ndarray  # (days,) unsheltered, distance-scaled
    sheltered: np.ndarray  # (days,) bool
    events: list = field(default_factory=list)


def plan_arrays(plan: Plan, start: int, days: int):
    """Behaviour arrays for mission days [start, days)."""
    idx = np.arange(start, days)
    c_res = np.where((idx % 7) < plan.resistance_days, 1.0, 0.0) * plan.adherence
    if plan.injury_start is not None and plan.injury_days > 0:
        injured = (idx >= plan.injury_start) & (idx < plan.injury_start + plan.injury_days)
        c_res = np.where(injured, 0.0, c_res)
    c_cardio = np.full(idx.shape, min(1.0, plan.cardio_min / P.PRESCRIBED_CARDIO_MIN) * plan.adherence)
    sleep = np.full(idx.shape, float(plan.sleep_h))
    return c_res, c_cardio, sleep


def logs_to_arrays(logs: dict, upto: int):
    """Logged history (minutes, hours) → compliance arrays for days [0, upto)."""
    c_res = models.compliance(np.asarray(logs["resistance_min"][:upto]), P.PRESCRIBED_RESISTANCE_MIN)
    c_cardio = models.compliance(np.asarray(logs["cardio_min"][:upto]), P.PRESCRIBED_CARDIO_MIN)
    sleep = np.asarray(logs["sleep_h"][:upto], dtype=float)
    return c_res, c_cardio, sleep


def build_inputs(logs: dict, current_day: int, plan: Plan, radiation: Radiation, days: int = P.MISSION_DAYS
                 ) -> DailyInputs:
    """History up to `current_day`, then `plan` until arrival."""
    current_day = max(0, min(current_day, days))
    past = logs_to_arrays(logs, current_day)
    future = plan_arrays(plan, current_day, days)
    c_res, c_cardio, sleep = (np.concatenate([p, f]) for p, f in zip(past, future))
    return DailyInputs(c_res=c_res, c_cardio=c_cardio, sleep_h=sleep, gcr_msv=radiation.gcr_msv,
                       spe_msv=radiation.spe_msv, sheltered=radiation.sheltered)


def habit_plan(profile: dict) -> Plan:
    """'If nothing changes': the full prescription done at the astronaut's usual adherence."""
    return Plan(resistance_days=7, cardio_min=P.PRESCRIBED_CARDIO_MIN, sleep_h=profile.get("sleep_mean_h", 6.6),
                adherence=profile["compliance"])
