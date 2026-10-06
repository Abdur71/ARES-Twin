"""ORM tables: crew profiles, daily logs and check-up measurements."""
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class CrewMember(Base):
    __tablename__ = "crew_members"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(64))
    role: Mapped[str] = mapped_column(String(64))
    age: Mapped[int] = mapped_column(Integer)
    r_bone_hip: Mapped[float] = mapped_column(Float)
    muscle_sensitivity: Mapped[str] = mapped_column(String(16))
    prior_dose_msv: Mapped[float] = mapped_column(Float)
    compliance: Mapped[float] = mapped_column(Float)
    sleep_mean_h: Mapped[float] = mapped_column(Float)
    baseline_hip_bmd: Mapped[float] = mapped_column(Float)
    baseline_leg_lean_kg: Mapped[float] = mapped_column(Float)
    baseline_vo2peak: Mapped[float] = mapped_column(Float)
    injury_start: Mapped[int | None] = mapped_column(Integer, nullable=True)
    injury_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    injury_label: Mapped[str | None] = mapped_column(String(128), nullable=True)

    logs: Mapped[list["DailyLog"]] = relationship(back_populates="member", cascade="all, delete-orphan",
                                                  order_by="DailyLog.day")
    measurements: Mapped[list["Measurement"]] = relationship(back_populates="member", cascade="all, delete-orphan",
                                                             order_by="Measurement.day")


class DailyLog(Base):
    __tablename__ = "daily_logs"
    __table_args__ = (UniqueConstraint("crew_id", "day"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    crew_id: Mapped[str] = mapped_column(ForeignKey("crew_members.id"), index=True)
    day: Mapped[int] = mapped_column(Integer)
    resistance_min: Mapped[float] = mapped_column(Float)
    cardio_min: Mapped[float] = mapped_column(Float)
    sleep_h: Mapped[float] = mapped_column(Float)
    event: Mapped[str | None] = mapped_column(String(256), nullable=True)

    member: Mapped[CrewMember] = relationship(back_populates="logs")


class Measurement(Base):
    """A check-up value in display units: bone = hip BMD g/cm², muscle = leg lean kg, cardio = VO2peak mL/kg/min."""

    __tablename__ = "measurements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    crew_id: Mapped[str] = mapped_column(ForeignKey("crew_members.id"), index=True)
    day: Mapped[int] = mapped_column(Integer)
    metric: Mapped[str] = mapped_column(String(16))
    value: Mapped[float] = mapped_column(Float)
    note: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    member: Mapped[CrewMember] = relationship(back_populates="measurements")
