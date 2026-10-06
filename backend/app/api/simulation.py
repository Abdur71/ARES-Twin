"""What-if simulator, countermeasure optimizer and hidden-truth twin experiment."""
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

from app.api.deps import member_or_404, mission_day
from app.db.database import get_db
from app.db.repository import profile
from app.services import twin
from app.simulation import params as P
from app.simulation.scenario import Plan, habit_plan
from app.spaceweather.service import mission_spaceweather

router = APIRouter(tags=["Simulation"])


class Storm(BaseModel):
    day: int = Field(ge=0, lt=P.MISSION_DAYS)
    peak_pfu: float = Field(ge=10, le=1_000_000, description="Peak >10 MeV proton flux (pfu)")
    sheltered: bool = True


class WhatIfIn(BaseModel):
    crew_id: str
    day: int | None = None
    resistance_days: int = Field(7, ge=0, le=7)
    cardio_min: float = Field(P.PRESCRIBED_CARDIO_MIN, ge=0, le=60)
    sleep_h: float = Field(7.0, ge=4, le=9)
    adherence: float = Field(1.0, ge=0, le=1)
    injury_start: int | None = Field(None, ge=0, lt=P.MISSION_DAYS)
    injury_days: int = Field(0, ge=0, le=120)
    storm: Storm | None = None
    shelter_overrides: dict[int, bool] = Field(default_factory=dict, description="event id → reached shelter")
    gcr_scenario: Literal["design_goal", "measured"] = P.DEFAULT_GCR_SCENARIO

    @model_validator(mode="after")
    def _injury_pair(self):
        if self.injury_days and self.injury_start is None:
            raise ValueError("injury_start is required when injury_days > 0")
        return self


@router.post("/whatif")
async def whatif(body: WhatIfIn, db: Session = Depends(get_db)):
    """Re-run the remaining mission from today with changed behaviour; compare against 'nothing changes'."""
    member = member_or_404(body.crew_id, db)
    d = mission_day(body.day)
    sw = await mission_spaceweather()
    base = twin.simulate_member(member, sw, d)
    plan = Plan(resistance_days=body.resistance_days, cardio_min=body.cardio_min, sleep_h=body.sleep_h,
                adherence=body.adherence, injury_start=body.injury_start, injury_days=body.injury_days)
    scen = twin.simulate_member(member, sw, d, plan=plan, gcr_scenario=body.gcr_scenario,
                                shelter_overrides=body.shelter_overrides,
                                extra_storms=[body.storm.model_dump()] if body.storm else None)
    return twin.compare(base, scen, P.DEFAULT_GCR_SCENARIO, body.gcr_scenario)


@router.get("/whatif/defaults/{crew_id}")
def whatif_defaults(crew_id: str, db: Session = Depends(get_db)):
    """Slider starting values = the astronaut's current habits."""
    plan = habit_plan(profile(member_or_404(crew_id, db)))
    return plan.__dict__


class OptimizeIn(BaseModel):
    crew_id: str
    day: int | None = None
    goal_readiness: float = Field(75, ge=0, le=100)
    goal_probability: float = Field(0.9, gt=0, le=1)
    include_adherence: bool = Field(False, description="Scale the plan by the astronaut's usual adherence")


@router.post("/optimize")
async def optimize(body: OptimizeIn, db: Session = Depends(get_db)):
    """Cheapest exercise plan (56 candidates × 200 Monte Carlo runs) that meets the readiness goal."""
    member = member_or_404(body.crew_id, db)
    sw = await mission_spaceweather()
    return twin.run_optimizer(member, sw, mission_day(body.day), body.goal_readiness, body.goal_probability,
                              body.include_adherence)


class ExperimentIn(BaseModel):
    crew_id: str = "rahman"
    seed: int = Field(7, ge=0, le=10_000)
    interval: int = Field(30, ge=7, le=90)


@router.post("/twin/experiment")
async def twin_experiment(body: ExperimentIn, db: Session = Depends(get_db)):
    """Hidden-truth experiment: a secret astronaut, noisy monthly check-ups, Bayesian convergence."""
    member = member_or_404(body.crew_id, db)
    sw = await mission_spaceweather()
    return twin.experiment(member, sw, body.seed, body.interval)
