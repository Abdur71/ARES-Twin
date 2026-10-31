"""FastAPI Router for Real-Time Wearable Telemetry, Sensor Ingestion, and WebSocket Streaming."""
import asyncio
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.api.deps import get_db, member_or_404
from app.simulation import clinical, params as P
from app.telemetry import (
    BiometricReading,
    CountermeasurePrescription,
    SimulatedStreamRequest,
    SleepArchitectureSample,
    TelemetryBatch,
    telemetry_manager,
)

router = APIRouter(tags=["Telemetry & Sensors"])


# ===========================================================================
# 1. Wearable Telemetry Ingestion Endpoints
# ===========================================================================

@router.post("/telemetry/ingest", summary="Ingest single biometric reading from wearable device")
async def ingest_biometric(reading: BiometricReading, db: Session = Depends(get_db)):
    """Ingest a single biometric data packet from a smartwatch, chest strap, or BLE/ANT+ gateway."""
    member_or_404(reading.crew_id, db)
    return await telemetry_manager.ingest_reading(reading)


@router.post("/telemetry/batch", summary="Batch ingest wearable sensor packets")
async def ingest_batch(batch: TelemetryBatch, db: Session = Depends(get_db)):
    """Bulk ingest biometric readings cached offline on a wearable device."""
    member_or_404(batch.crew_id, db)
    return await telemetry_manager.ingest_batch(batch)


@router.post("/telemetry/sleep", summary="Ingest sleep architecture record")
def ingest_sleep(session_data: SleepArchitectureSample, db: Session = Depends(get_db)):
    """Log polysomnography or smartwatch sleep stage architecture (light, deep, REM, efficiency)."""
    member_or_404(session_data.crew_id, db)
    return telemetry_manager.ingest_sleep_session(session_data)


# ===========================================================================
# 2. Live Telemetry & Historical Queries
# ===========================================================================

@router.get("/telemetry/live/{crew_id}", summary="Get latest live biometric state")
def get_live_biometrics(crew_id: str, db: Session = Depends(get_db)):
    """Retrieve the most recent instantaneous sensor reading and acute alarms for a crew member."""
    member = member_or_404(crew_id, db)
    reading = telemetry_manager.get_latest_reading(member.id)
    alarms = telemetry_manager.check_acute_biometric_alarms(reading) if reading else []

    return {
        "crew_id": member.id,
        "name": member.name,
        "role": member.role,
        "has_live_stream": reading is not None,
        "latest_reading": reading.model_dump(mode="json") if reading else None,
        "acute_alarms": alarms
    }


@router.get("/telemetry/history/{crew_id}", summary="Get recent buffered sensor readings")
def get_telemetry_history(
    crew_id: str,
    limit: int = Query(60, ge=1, le=600, description="Number of recent samples to return"),
    db: Session = Depends(get_db)
):
    """Fetch the last N buffered biometric samples for charting and waveform display."""
    member = member_or_404(crew_id, db)
    samples = telemetry_manager.get_history(member.id, limit=limit)
    return {
        "crew_id": member.id,
        "count": len(samples),
        "readings": [s.model_dump(mode="json") for s in samples]
    }


@router.get("/telemetry/summary/{crew_id}", summary="24h Telemetry analytics & TRIMP cardiovascular strain")
def get_crew_telemetry_summary(crew_id: str, db: Session = Depends(get_db)):
    """Calculate TRIMP training impulse, resting heart rate, active minutes, and autonomic recovery."""
    member = member_or_404(crew_id, db)
    return telemetry_manager.get_crew_summary(member.id)


# ===========================================================================
# 3. Synthetic Streaming & Demo Simulation
# ===========================================================================

@router.post("/telemetry/simulate/{crew_id}", summary="Simulate synthetic live sensor stream")
async def simulate_live_stream(
    crew_id: str,
    body: SimulatedStreamRequest | None = None,
    db: Session = Depends(get_db)
):
    """Generate and ingest realistic synthetic biometric readings to test live streaming and alarms."""
    member = member_or_404(crew_id, db)
    act_type = body.activity_type if body else "exercise"
    samples_count = body.samples_count if body else 5

    generated = []
    for _ in range(samples_count):
        sample = telemetry_manager.generate_synthetic_reading(member.id, activity_type=act_type)
        await telemetry_manager.ingest_reading(sample)
        generated.append(sample.model_dump(mode="json"))

    return {
        "status": "STREAM_SIMULATED",
        "crew_id": member.id,
        "activity_type": act_type,
        "samples_ingested": len(generated),
        "latest_sample": generated[-1]
    }


# ===========================================================================
# 4. WebSocket Real-Time Telemetry Stream
# ===========================================================================

@router.websocket("/telemetry/ws/{crew_id}")
async def websocket_telemetry_stream(websocket: WebSocket, crew_id: str):
    """Live WebSocket channel streaming 1Hz biometric packets, heart rate, and acute clinical alarms."""
    cid = crew_id.lower()
    await telemetry_manager.connect_websocket(websocket, cid)
    try:
        # Initial greeting with latest state
        latest = telemetry_manager.get_latest_reading(cid)
        await websocket.send_json({
            "type": "CONNECTION_ESTABLISHED",
            "crew_id": cid,
            "connected_at": asyncio.get_event_loop().time(),
            "latest_reading": latest.model_dump(mode="json") if latest else None
        })

        # Keep connection open and listen for client pings or heartbeats
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        telemetry_manager.disconnect_websocket(websocket, cid)
    except Exception:
        telemetry_manager.disconnect_websocket(websocket, cid)


# ===========================================================================
# 5. Clinical Risk Evaluation & Countermeasures Endpoints
# ===========================================================================

@router.post("/simulation/clinical/countermeasures", summary="Simulate clinical countermeasures efficacy")
def simulate_countermeasures(rx: CountermeasurePrescription):
    """Paired before-and-after simulation of clinical countermeasures:
    
    1. Nephrolithiasis: Baseline vs Potassium Citrate + 2.5L Hydration
    2. SANS: Baseline vs Daily Lower Body Negative Pressure (LBNP 25 mmHg)
    3. Orthostatic Intolerance: Baseline vs Pre-landing Fluid Loading + Compression Garment
    """
    bone_loss_frac = rx.bone_loss_pct / 100.0
    return clinical.simulate_clinical_interventions(
        bone_loss=bone_loss_frac,
        mission_days=rx.mission_days,
        vo2_loss_pct=rx.vo2_loss_pct,
        urine_vol_l=rx.urine_vol_l,
        k_citrate_meq=rx.potassium_citrate_meq,
        lbnp_hours_day=rx.lbnp_hours_day,
        fluid_loading=rx.fluid_loading,
        compression_garment=rx.compression_garment
    )


@router.get("/simulation/clinical/supersaturation/{crew_id}", summary="Evaluate urinary supersaturation profile")
def urinary_supersaturation_profile(
    crew_id: str,
    urine_vol_l: float = Query(P.URINE_VOL_BASE_L, ge=0.5, le=5.0),
    k_citrate_meq: float = Query(0.0, ge=0.0, le=100.0),
    high_sodium: bool = Query(False),
    db: Session = Depends(get_db)
):
    """Detailed biochemical supersaturation analysis for Calcium Oxalate and Brushite."""
    member = member_or_404(crew_id, db)
    # Estimate current bone loss from profile
    simulated_bone_loss = member.r_bone_hip * 6.0  # approximate 6 months
    return {
        "crew_id": member.id,
        "name": member.name,
        "analysis": clinical.urinary_supersaturation(
            simulated_bone_loss,
            urine_volume_l=urine_vol_l,
            potassium_citrate_meq=k_citrate_meq,
            high_sodium=high_sodium
        )
    }


@router.get("/simulation/clinical/orthostatic/{crew_id}", summary="Evaluate Mars landing orthostatic presyncope risk")
def orthostatic_risk_assessment(
    crew_id: str,
    mission_days: int = Query(270, ge=1, le=1040),
    fluid_loading: bool = Query(False),
    compression_garment: bool = Query(False),
    db: Session = Depends(get_db)
):
    """Cardiovascular deconditioning, stand test blood pressure drop, and presyncope probability."""
    member = member_or_404(crew_id, db)
    return {
        "crew_id": member.id,
        "name": member.name,
        "assessment": clinical.cardiovascular_orthostatic_risk(
            mission_days=mission_days,
            vo2_loss_pct=12.0,
            fluid_loading=fluid_loading,
            compression_garment=compression_garment,
            target_gravity=P.GRAVITY_MARS
        )
    }
