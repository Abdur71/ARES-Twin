"""Crew overview, digital-twin detail, daily logs and check-up measurements."""
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import member_or_404, mission_day
from app.db.database import get_db
from app.db.models import CrewMember, Measurement
from app.db.repository import BASELINE_KEY, list_crew, logs_dict, measurement_dict, profile
from app.services import twin
from app.simulation import params as P
from app.spaceweather.service import mission_spaceweather

router = APIRouter(prefix="/crew", tags=["Crew"])


@router.get("")
async def crew_overview(day: int | None = Query(None), db: Session = Depends(get_db)):
    """Four crew cards: arrival readiness forecast, status band, dose used and alert counts."""
    d = mission_day(day)
    sw = await mission_spaceweather()
    cards = []
    for member in list_crew(db):
        s = twin.summary(twin.simulate_member(member, sw, d))
        cards.append({
            "profile": s["profile"],
            "arrival": s["arrival"],
            "today": s["today"],
            "radiation": s["radiation"],
            "alerts": s["alerts"],
        })
    return {"current_day": d, "crew": cards}


@router.get("/{crew_id}")
async def crew_detail(day: int | None = Query(None),
                      gcr_scenario: Literal["design_goal", "measured"] = P.DEFAULT_GCR_SCENARIO,
                      member: CrewMember = Depends(member_or_404)):
    """Full digital twin: forecast bands, gauges, alerts, radiation budget, posterior rates."""
    d = mission_day(day)
    sw = await mission_spaceweather()
    t = twin.simulate_member(member, sw, d, gcr_scenario=gcr_scenario)
    return twin.detail(t, sw, gcr_scenario)


@router.get("/{crew_id}/logs")
def crew_logs(member: CrewMember = Depends(member_or_404)):
    return {"crew_id": member.id, **logs_dict(member)}


class MeasurementIn(BaseModel):
    day: int = Field(ge=1, le=P.MISSION_DAYS)
    metric: Literal["bone", "muscle", "cardio"]
    value: float = Field(gt=0, description="hip BMD g/cm², leg lean mass kg, or VO2peak mL/kg/min")
    note: str | None = Field(None, max_length=256)


@router.get("/{crew_id}/measurements")
def list_measurements(member: CrewMember = Depends(member_or_404)):
    return [measurement_dict(x, member) for x in member.measurements]


@router.post("/{crew_id}/measurements", status_code=201)
def add_measurement(body: MeasurementIn, member: CrewMember = Depends(member_or_404), db: Session = Depends(get_db)):
    """Record a check-up value; the twin's personal rates update on the next forecast."""
    # member_or_404 and this endpoint share one session (FastAPI caches get_db per request)
    rel = body.value / profile(member)["baseline"][BASELINE_KEY[body.metric]]
    if not 0.3 <= rel <= 1.3:
        raise HTTPException(422, f"Value is {rel:.0%} of baseline — outside the plausible range (30–130 %).")
    x = Measurement(crew_id=member.id, day=body.day, metric=body.metric, value=body.value, note=body.note)
    db.add(x)
    db.commit()
    db.refresh(x)
    return measurement_dict(x, member)


@router.delete("/{crew_id}/measurements/{measurement_id}", status_code=204)
def delete_measurement(measurement_id: int, member: CrewMember = Depends(member_or_404),
                       db: Session = Depends(get_db)):
    x = db.get(Measurement, measurement_id)
    if x is None or x.crew_id != member.id:
        raise HTTPException(404, "Measurement not found")
    db.delete(x)
    db.commit()
