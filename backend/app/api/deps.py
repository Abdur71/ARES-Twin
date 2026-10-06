"""Shared request helpers."""
from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.config.settings import settings
from app.db.database import get_db
from app.db.models import CrewMember
from app.db.repository import get_member
from app.simulation import params as P


def mission_day(day: int | None) -> int:
    d = settings.MISSION_CURRENT_DAY if day is None else day
    if not 0 <= d <= P.MISSION_DAYS:
        raise HTTPException(422, f"day must be between 0 and {P.MISSION_DAYS}")
    return d


def member_or_404(crew_id: str, db: Session = Depends(get_db)) -> CrewMember:
    member = get_member(db, crew_id)
    if member is None:
        raise HTTPException(404, f"Unknown crew member '{crew_id}'")
    return member
