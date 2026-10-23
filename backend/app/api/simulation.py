"""What-if simulator, countermeasure optimizer and hidden-truth twin experiment."""
from typing import Literal

import numpy as np
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
    hydration_factor: float = Field(1.0, ge=0.5, le=2.0, description="Daily hydration relative to baseline")
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
                adherence=body.adherence, injury_start=body.injury_start, injury_days=body.injury_days,
                hydration_factor=body.hydration_factor)
    scen = twin.simulate_member(member, sw, d, plan=plan, gcr_scenario=body.gcr_scenario,
                                shelter_overrides=body.shelter_overrides,
                                extra_storms=[body.storm.model_dump()] if body.storm else None)
    return twin.compare(base, scen, P.DEFAULT_GCR_SCENARIO, body.gcr_scenario)


@router.get("/whatif/defaults/{crew_id}")
def whatif_defaults(crew_id: str, db: Session = Depends(get_db)):
    """Slider starting values = the astronaut's current habits."""
    plan = habit_plan(profile(member_or_404(crew_id, db)))
    return plan.__dict__


@router.get("/simulation/phases")
def mission_phases():
    """Conjunction-class mission phases (Outbound transit, 500-day Mars surface stay, Return transit)."""
    from app.simulation.phases import phases_manifest
    return phases_manifest()


@router.get("/simulation/conjunction/{crew_id}")
async def conjunction_mission(
    crew_id: str,
    gcr_scenario: Literal["design_goal", "measured"] = P.DEFAULT_GCR_SCENARIO,
    db: Session = Depends(get_db)
):
    """Simulate complete 1040-day conjunction-class mission across Outbound, 0.38g Surface Stay, and Return."""
    member = member_or_404(crew_id, db)
    return twin.simulate_conjunction_mission(member, gcr_scenario=gcr_scenario)


@router.get("/simulation/clinical/{crew_id}")
async def clinical_assessment(
    crew_id: str,
    day: int | None = None,
    db: Session = Depends(get_db)
):
    """Detailed clinical spaceflight risk evaluation (Nephrolithiasis / Kidney Stones and SANS)."""
    from app.simulation.clinical import kidney_stone_cumulative_probability, kidney_stone_relative_risk, sans_onsd_trajectory, urinary_calcium_excretion
    member = member_or_404(crew_id, db)
    d = mission_day(day)
    sw = await mission_spaceweather()
    t = twin.simulate_member(member, sw, d)
    
    bone_losses = 1.0 - t.result["bone"]
    med_bone = float(np.median(bone_losses[:, d]))
    
    # Timeline trajectories
    timeline_days = list(range(0, P.MISSION_DAYS + 1, 5))
    med_bone_timeline = [float(np.median(bone_losses[:, day_idx])) for day_idx in timeline_days]
    ca_timeline = [float(urinary_calcium_excretion(b)) for b in med_bone_timeline]
    stone_rr_timeline = [float(kidney_stone_relative_risk(b)) for b in med_bone_timeline]
    stone_cum_p = [float(p) for p in kidney_stone_cumulative_probability(med_bone_timeline)]
    onsd_timeline = [float(sans_onsd_trajectory(day_idx)) for day_idx in timeline_days]
    
    arr = t.result["bone"].shape[-1] - 1
    arrival_summary_data = twin.arrival_summary(t.result)
    
    return {
        "crew_id": member.id,
        "current_day": d,
        "current": arrival_summary_data.get("clinical", {}),
        "timeline": {
            "days": timeline_days,
            "urinary_calcium_mg_day": ca_timeline,
            "kidney_stone_relative_risk": stone_rr_timeline,
            "kidney_stone_cum_probability": stone_cum_p,
            "sans_onsd_mm": onsd_timeline,
        },
        "sleep_metrics": arrival_summary_data.get("sleep", {})
    }


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
