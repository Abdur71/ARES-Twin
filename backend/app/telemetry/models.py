"""Pydantic data models for wearable sensor telemetry, sleep architecture, and live biometrics."""
from datetime import datetime, timezone
from typing import Literal
from pydantic import BaseModel, Field


class BiometricReading(BaseModel):
    """Instantaneous or high-frequency wearable sensor sample (Smartwatch, Chest Strap, BLE/ANT+)."""
    crew_id: str = Field(..., description="Unique crew member ID (e.g. 'rahman', 'chen')")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    heart_rate: float = Field(..., ge=30.0, le=240.0, description="Instantaneous heart rate (bpm)")
    hrv_rmssd: float = Field(..., ge=1.0, le=300.0, description="Root Mean Square of Successive Differences (ms) - parasympathetic tone")
    hrv_sdnn: float | None = Field(default=None, ge=1.0, le=400.0, description="Standard deviation of NN intervals (ms)")
    spo2: float = Field(..., ge=60.0, le=100.0, description="Blood oxygen saturation percentage (%)")
    skin_temp_c: float = Field(..., ge=28.0, le=43.0, description="Skin temperature in degrees Celsius")
    respiratory_rate: float = Field(..., ge=4.0, le=60.0, description="Breathing rate (breaths per minute)")
    active_wattage: float = Field(default=0.0, ge=0.0, le=1000.0, description="Cycle-ergometer / resistance exercise wattage (Watts)")
    cadence: float = Field(default=0.0, ge=0.0, le=200.0, description="Pedaling or stepping cadence (rpm)")
    metabolic_equivalent_mets: float = Field(default=1.0, ge=0.8, le=20.0, description="Metabolic Equivalent of Task (METs)")
    step_or_cycle_count: int = Field(default=0, ge=0, description="Cumulative daily steps or revolution count")
    device_source: str = Field(default="Crew Smartwatch BLE/ANT+", description="Hardware source or protocol")


class SleepArchitectureSample(BaseModel):
    """Nightly polysomnography / actigraphy sleep architecture breakdown."""
    crew_id: str = Field(..., description="Crew member ID")
    night_start: datetime = Field(..., description="Time crew entered sleep state")
    night_end: datetime = Field(..., description="Time crew awakened")
    total_sleep_hours: float = Field(..., ge=0.0, le=24.0, description="Total recorded sleep duration (hours)")
    deep_sleep_hours: float = Field(..., ge=0.0, le=12.0, description="Slow-wave restorative deep sleep (hours)")
    rem_sleep_hours: float = Field(..., ge=0.0, le=12.0, description="Rapid Eye Movement cognitive sleep (hours)")
    light_sleep_hours: float = Field(..., ge=0.0, le=16.0, description="Light non-REM sleep (hours)")
    awakenings_count: int = Field(default=0, ge=0, description="Number of brief nocturnal awakenings")
    sleep_efficiency_pct: float = Field(default=88.0, ge=0.0, le=100.0, description="Sleep efficiency percentage")
    hrv_overnight_recovery: float = Field(default=65.0, ge=5.0, le=200.0, description="Mean overnight HRV RMSSD (ms)")


class TelemetryBatch(BaseModel):
    """Batch of biometric readings for bulk sensor synchronization."""
    crew_id: str
    readings: list[BiometricReading]


class SimulatedStreamRequest(BaseModel):
    """Request parameters for generating synthetic live telemetry streams."""
    crew_id: str = "rahman"
    activity_type: Literal["resting", "exercise", "eva", "sleep"] = "exercise"
    samples_count: int = Field(default=10, ge=1, le=120, description="Number of sequential 1-second samples to generate")


class CountermeasurePrescription(BaseModel):
    """Prescription inputs for clinical countermeasure simulation."""
    bone_loss_pct: float = Field(default=6.5, ge=0.0, le=30.0, description="Observed or simulated bone loss (%)")
    mission_days: int = Field(default=180, ge=1, le=1040, description="Elapsed mission days")
    vo2_loss_pct: float = Field(default=12.0, ge=0.0, le=50.0, description="Cardiovascular VO2peak loss (%)")
    urine_vol_l: float = Field(default=1.5, ge=0.5, le=5.0, description="Daily urine output volume (L)")
    potassium_citrate_meq: float = Field(default=30.0, ge=0.0, le=100.0, description="Daily Potassium Citrate dose (mEq/day)")
    lbnp_hours_day: float = Field(default=2.0, ge=0.0, le=8.0, description="Daily Lower Body Negative Pressure session (hours/day)")
    fluid_loading: bool = Field(default=True, description="Pre-landing 1L isotonic electrolyte fluid loading")
    compression_garment: bool = Field(default=True, description="Lower body 30-40 mmHg antigravity compression suit")
