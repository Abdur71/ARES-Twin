"""Database access: seeding and plain-dict views used by the services."""
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.crew.generator import generate_logs, load_crew
from app.db.database import Base, engine
from app.db.models import CrewMember, DailyLog, Measurement

BASELINE_KEY = {"bone": "hip_bmd", "muscle": "leg_lean_kg", "cardio": "vo2peak"}
UNITS = {"bone": "g/cm²", "muscle": "kg", "cardio": "mL/kg/min"}


def init_db(session: Session) -> None:
    """Create tables and seed the virtual crew + daily logs on first run."""
    Base.metadata.create_all(engine)
    if session.scalar(select(CrewMember.id).limit(1)):
        return
    data = load_crew()
    for m in data["crew"]:
        injury = m.get("injury") or {}
        member = CrewMember(
            id=m["id"], name=m["name"], role=m["role"], age=m["age"], r_bone_hip=m["r_bone_hip"],
            muscle_sensitivity=m["muscle_sensitivity"], prior_dose_msv=m["prior_dose_msv"],
            compliance=m["compliance"], sleep_mean_h=m["sleep_mean_h"],
            baseline_hip_bmd=m["baseline"]["hip_bmd"], baseline_leg_lean_kg=m["baseline"]["leg_lean_kg"],
            baseline_vo2peak=m["baseline"]["vo2peak"], injury_start=injury.get("start_day"),
            injury_days=injury.get("days"), injury_label=injury.get("label"),
        )
        logs = generate_logs(m, data["crew_events"])
        member.logs = [
            DailyLog(day=d, resistance_min=logs["resistance_min"][d], cardio_min=logs["cardio_min"][d],
                     sleep_h=logs["sleep_h"][d], event=logs["events"][d])
            for d in range(len(logs["sleep_h"]))
        ]
        session.add(member)
    try:
        session.commit()
    except IntegrityError:  # another worker/process seeded at the same moment — its data wins
        session.rollback()


def profile(m: CrewMember) -> dict:
    return {
        "id": m.id, "name": m.name, "role": m.role, "age": m.age, "r_bone_hip": m.r_bone_hip,
        "muscle_sensitivity": m.muscle_sensitivity, "prior_dose_msv": m.prior_dose_msv,
        "compliance": m.compliance, "sleep_mean_h": m.sleep_mean_h,
        "baseline": {"hip_bmd": m.baseline_hip_bmd, "leg_lean_kg": m.baseline_leg_lean_kg,
                     "vo2peak": m.baseline_vo2peak},
        "injury": {"start_day": m.injury_start, "days": m.injury_days, "label": m.injury_label}
        if m.injury_start is not None else None,
        "simulated": True,
    }


def logs_dict(m: CrewMember) -> dict:
    return {
        "resistance_min": [l.resistance_min for l in m.logs],
        "cardio_min": [l.cardio_min for l in m.logs],
        "sleep_h": [l.sleep_h for l in m.logs],
        "events": [l.event for l in m.logs],
    }


def measurement_dict(x: Measurement, m: CrewMember) -> dict:
    base = profile(m)["baseline"][BASELINE_KEY[x.metric]]
    return {"id": x.id, "day": x.day, "metric": x.metric, "value": x.value, "unit": UNITS[x.metric],
            "rel_value": x.value / base, "note": x.note, "created_at": x.created_at.isoformat()}


def list_crew(session: Session) -> list[CrewMember]:
    return list(session.scalars(select(CrewMember).order_by(CrewMember.id)))


def get_member(session: Session, crew_id: str) -> CrewMember | None:
    return session.get(CrewMember, crew_id)
