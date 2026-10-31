"""Telemetry Service: Real-time biometric buffering, acute alerts, TRIMP strain, and WebSocket streaming."""
import asyncio
from collections import defaultdict, deque
from datetime import datetime, timezone
import math
import random
from typing import Literal
from fastapi import WebSocket

from app.telemetry.models import (
    BiometricReading,
    SleepArchitectureSample,
    TelemetryBatch,
)


class TelemetryManager:
    """Manages real-time ingestion, circular buffers, analytics, and live WebSocket streaming."""

    def __init__(self, buffer_maxlen: int = 3600):
        self.buffer_maxlen = buffer_maxlen
        # Per-crew circular buffers storing latest readings (e.g. 1 hour of 1Hz data)
        self._buffers: dict[str, deque[BiometricReading]] = defaultdict(lambda: deque(maxlen=self.buffer_maxlen))
        # Per-crew sleep history
        self._sleep_records: dict[str, list[SleepArchitectureSample]] = defaultdict(list)
        # Active WebSocket connections: crew_id -> set of WebSockets ('all' for broadcast to all)
        self._active_connections: dict[str, set[WebSocket]] = defaultdict(set)
        # Synthetic simulation tasks
        self._streaming_tasks: dict[str, asyncio.Task] = {}

    # -----------------------------------------------------------------------
    # Ingestion & Acute Clinical Warnings
    # -----------------------------------------------------------------------

    def check_acute_biometric_alarms(self, reading: BiometricReading) -> list[dict]:
        """Detect instantaneous life-safety or acute physiological anomalies."""
        alarms = []
        # 1. Hypoxia alert (critical in pressurized spacecraft or EVA spacesuits)
        if reading.spo2 < 90.0:
            alarms.append({
                "severity": "CRITICAL",
                "code": "HYPOXIA_ALERT",
                "message": f"Critical low SpO2 ({reading.spo2:.1f}%). Suspect cabin depressurization or suit life-support failure."
            })
        elif reading.spo2 < 93.0:
            alarms.append({
                "severity": "WARNING",
                "code": "MILD_DESATURATION",
                "message": f"Borderline oxygen saturation ({reading.spo2:.1f}%)."
            })

        # 2. Pathological or extreme Tachycardia / Arrhythmia detection
        if reading.heart_rate > 175.0 and reading.active_wattage < 60.0:
            alarms.append({
                "severity": "CRITICAL",
                "code": "UNPROVOKED_TACHYCARDIA",
                "message": f"Severe resting tachycardia ({reading.heart_rate:.0f} bpm) without exercise load. Check for panic, sepsis, or arrhythmia."
            })
        elif reading.heart_rate > 195.0:
            alarms.append({
                "severity": "WARNING",
                "code": "CARDIO_EXERTION_CEILING",
                "message": f"Heart rate approaching maximum physiological threshold ({reading.heart_rate:.0f} bpm)."
            })

        # 3. Severe Autonomic Fatigue / Parasympathetic Suppression
        if reading.hrv_rmssd < 15.0 and reading.active_wattage < 20.0:
            alarms.append({
                "severity": "WARNING",
                "code": "ACUTE_AUTONOMIC_STRAIN",
                "message": f"Severe parasympathetic withdrawal (HRV RMSSD {reading.hrv_rmssd:.1f} ms). High cumulative stress or illness."
            })

        # 4. Skin Hyperthermia / Heat Exhaustion in EVA suit
        if reading.skin_temp_c > 38.6:
            alarms.append({
                "severity": "CRITICAL",
                "code": "THERMAL_STRAIN_HYPERTHERMIA",
                "message": f"Elevated skin temp ({reading.skin_temp_c:.1f}°C). Check suit liquid cooling ventilation garment (LCVG)."
            })

        return alarms

    async def ingest_reading(self, reading: BiometricReading) -> dict:
        """Ingest a single biometric sensor packet, append to buffer, and broadcast to subscribers."""
        cid = reading.crew_id.lower()
        self._buffers[cid].append(reading)
        alarms = self.check_acute_biometric_alarms(reading)

        payload = {
            "type": "BIOMETRIC_UPDATE",
            "crew_id": cid,
            "data": reading.model_dump(mode="json"),
            "alarms": alarms,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

        # Broadcast via WebSocket asynchronously
        await self._broadcast(cid, payload)
        return {"status": "INGESTED", "crew_id": cid, "alarms": alarms}

    async def ingest_batch(self, batch: TelemetryBatch) -> dict:
        """Batch ingestion of offline wearable sync packets."""
        cid = batch.crew_id.lower()
        count = 0
        latest_alarms = []
        for r in batch.readings:
            r.crew_id = cid
            self._buffers[cid].append(r)
            count += 1
            latest_alarms = self.check_acute_biometric_alarms(r)

        return {
            "status": "BATCH_INGESTED",
            "crew_id": cid,
            "readings_count": count,
            "buffer_depth": len(self._buffers[cid]),
            "latest_alarms": latest_alarms
        }

    def ingest_sleep_session(self, session: SleepArchitectureSample) -> dict:
        """Store polysomnography / sleep stage architecture record."""
        cid = session.crew_id.lower()
        self._sleep_records[cid].append(session)
        return {
            "status": "SLEEP_LOGGED",
            "crew_id": cid,
            "total_sleep_hours": session.total_sleep_hours,
            "deep_sleep_pct": round((session.deep_sleep_hours / max(0.1, session.total_sleep_hours)) * 100, 1),
            "rem_sleep_pct": round((session.rem_sleep_hours / max(0.1, session.total_sleep_hours)) * 100, 1),
            "sleep_efficiency": session.sleep_efficiency_pct
        }

    # -----------------------------------------------------------------------
    # Analytics & TRIMP Calculation
    # -----------------------------------------------------------------------

    def get_latest_reading(self, crew_id: str) -> BiometricReading | None:
        """Return the most recent sensor reading from the circular buffer."""
        cid = crew_id.lower()
        buf = self._buffers.get(cid)
        if buf and len(buf) > 0:
            return buf[-1]
        return None

    def get_history(self, crew_id: str, limit: int = 60) -> list[BiometricReading]:
        """Return last N readings in chronological order."""
        cid = crew_id.lower()
        buf = self._buffers.get(cid)
        if not buf:
            return []
        items = list(buf)
        return items[-limit:]

    def calculate_trimp_strain(self, readings: list[BiometricReading], hr_rest: float = 60.0, hr_max: float = 190.0) -> float:
        """Banister's Training Impulse (TRIMP) model for cardiovascular training load.
        
        TRIMP = sum( duration_min * delta_HR_ratio * 0.64 * exp(1.92 * delta_HR_ratio) )
        """
        if not readings:
            return 0.0

        total_trimp = 0.0
        # Assume 1-second sampling unless timestamps differ
        dt_min = 1.0 / 60.0

        for r in readings:
            if r.heart_rate <= hr_rest:
                continue
            hr_ratio = min(1.0, max(0.0, (r.heart_rate - hr_rest) / (hr_max - hr_rest)))
            # Banister gender-neutral exponential multiplier for cardiovascular strain
            strain_factor = hr_ratio * 0.64 * math.exp(1.92 * hr_ratio)
            total_trimp += dt_min * strain_factor

        return round(total_trimp, 2)

    def get_crew_summary(self, crew_id: str) -> dict:
        """Comprehensive telemetry summary: heart rate stats, active exercise minutes, TRIMP, and sleep."""
        cid = crew_id.lower()
        readings = list(self._buffers.get(cid, []))
        latest = self.get_latest_reading(cid)

        # Latest sleep session if available
        sleeps = self._sleep_records.get(cid, [])
        sleep_info = None
        if sleeps:
            last_sleep = sleeps[-1]
            sleep_info = {
                "total_hours": last_sleep.total_sleep_hours,
                "deep_hours": last_sleep.deep_sleep_hours,
                "rem_hours": last_sleep.rem_sleep_hours,
                "efficiency_pct": last_sleep.sleep_efficiency_pct,
                "hrv_recovery_ms": last_sleep.hrv_overnight_recovery
            }

        if not readings:
            return {
                "crew_id": cid,
                "has_live_telemetry": False,
                "buffer_samples_count": 0,
                "latest_reading": None,
                "latest_sleep": sleep_info,
                "message": "No active telemetry readings ingested yet for this crew member."
            }

        hrs = [r.heart_rate for r in readings]
        rmssds = [r.hrv_rmssd for r in readings]
        spo2s = [r.spo2 for r in readings]
        watts = [r.active_wattage for r in readings]

        # Active exercise minutes: readings with wattage > 40W or HR > 115 bpm
        active_samples = sum(1 for r in readings if r.active_wattage > 40.0 or r.heart_rate > 115.0)
        active_min = round(active_samples / 60.0, 1)

        # Non-exercise resting heart rate
        rest_hrs = [r.heart_rate for r in readings if r.active_wattage < 20.0 and r.heart_rate < 100.0]
        resting_hr = round(float(sum(rest_hrs) / len(rest_hrs)), 1) if rest_hrs else round(float(min(hrs)), 1)

        trimp = self.calculate_trimp_strain(readings, hr_rest=resting_hr)

        # Autonomic balance index (Resting HR / RMSSD)
        mean_rmssd = round(float(sum(rmssds) / len(rmssds)), 1)
        autonomic_stress = round(resting_hr / max(10.0, mean_rmssd), 2)

        latest_alarms = self.check_acute_biometric_alarms(latest) if latest else []

        return {
            "crew_id": cid,
            "has_live_telemetry": True,
            "buffer_samples_count": len(readings),
            "latest_reading": latest.model_dump(mode="json") if latest else None,
            "resting_heart_rate_bpm": resting_hr,
            "mean_heart_rate_bpm": round(float(sum(hrs) / len(hrs)), 1),
            "peak_heart_rate_bpm": round(float(max(hrs)), 1),
            "mean_hrv_rmssd_ms": mean_rmssd,
            "mean_spo2_pct": round(float(sum(spo2s) / len(spo2s)), 1),
            "peak_active_wattage_w": round(float(max(watts)), 1),
            "active_exercise_minutes": active_min,
            "trimp_cardio_strain": trimp,
            "autonomic_stress_index": autonomic_stress,
            "latest_sleep": sleep_info,
            "active_alarms": latest_alarms,
            "twin_sync_active": True
        }

    def get_sync_compliance(self, crew_id: str) -> dict | None:
        """Returns empirical exercise compliance derived directly from wearable sensor stream.
        
        Overrides synthetic preset schedule when active wearable telemetry is streaming.
        """
        cid = crew_id.lower()
        readings = list(self._buffers.get(cid, []))
        if len(readings) < 60:  # Need at least 1 minute of telemetry
            return None

        # Exercise detection: wattage > 40W or HR > 120 bpm
        exercise_sec = sum(1 for r in readings if r.active_wattage > 40.0 or r.heart_rate > 120.0)
        cardio_min = exercise_sec / 60.0
        # Prescribed is 60 min
        c_cardio = min(1.0, cardio_min / 60.0)

        # Resistance work from high active wattage (> 140W)
        res_sec = sum(1 for r in readings if r.active_wattage > 140.0)
        c_res = min(1.0, (res_sec / 60.0) / 45.0)

        sleep_h = 7.5
        sleeps = self._sleep_records.get(cid, [])
        if sleeps:
            sleep_h = sleeps[-1].total_sleep_hours

        return {
            "c_cardio": round(c_cardio, 2),
            "c_res": round(c_res, 2),
            "sleep_h": round(sleep_h, 1),
            "cardio_min_recorded": round(cardio_min, 1),
            "source": "WEARABLE_LIVE_STREAM"
        }

    # -----------------------------------------------------------------------
    # Synthetic Sensor Stream Generator
    # -----------------------------------------------------------------------

    def generate_synthetic_reading(
        self,
        crew_id: str,
        activity_type: Literal["resting", "exercise", "eva", "sleep"] = "exercise"
    ) -> BiometricReading:
        """Generate high-fidelity, biologically coherent astronaut biometrics for testing & demonstration."""
        cid = crew_id.lower()
        now = datetime.now(timezone.utc)

        if activity_type == "exercise":
            # Cycle ergometer / CEVIS workout session
            hr = round(random.gauss(152.0, 6.0), 1)
            rmssd = round(random.gauss(22.0, 3.0), 1)
            spo2 = round(random.uniform(96.5, 98.5), 1)
            temp = round(random.gauss(37.3, 0.2), 2)
            resp = round(random.gauss(28.0, 2.0), 1)
            watt = round(random.gauss(185.0, 15.0), 1)
            cadence = round(random.gauss(82.0, 4.0), 1)
            mets = 8.5
        elif activity_type == "eva":
            # Spacewalk / EVA suit metabolic load
            hr = round(random.gauss(112.0, 8.0), 1)
            rmssd = round(random.gauss(38.0, 5.0), 1)
            spo2 = round(random.uniform(98.0, 99.5), 1)
            temp = round(random.gauss(36.4, 0.2), 2)
            resp = round(random.gauss(18.0, 1.5), 1)
            watt = round(random.gauss(65.0, 10.0), 1)
            cadence = 0.0
            mets = 4.2
        elif activity_type == "sleep":
            # Slow-wave / REM sleep
            hr = round(random.gauss(52.0, 3.0), 1)
            rmssd = round(random.gauss(84.0, 8.0), 1)
            spo2 = round(random.uniform(97.5, 99.0), 1)
            temp = round(random.gauss(36.2, 0.15), 2)
            resp = round(random.gauss(11.0, 1.0), 1)
            watt = 0.0
            cadence = 0.0
            mets = 0.95
        else:  # resting
            hr = round(random.gauss(64.0, 4.0), 1)
            rmssd = round(random.gauss(62.0, 6.0), 1)
            spo2 = round(random.uniform(98.0, 99.5), 1)
            temp = round(random.gauss(36.6, 0.15), 2)
            resp = round(random.gauss(13.5, 1.0), 1)
            watt = 0.0
            cadence = 0.0
            mets = 1.1

        return BiometricReading(
            crew_id=cid,
            timestamp=now,
            heart_rate=max(40.0, hr),
            hrv_rmssd=max(5.0, rmssd),
            hrv_sdnn=round(rmssd * 1.35, 1),
            spo2=min(100.0, max(85.0, spo2)),
            skin_temp_c=temp,
            respiratory_rate=resp,
            active_wattage=max(0.0, watt),
            cadence=max(0.0, cadence),
            metabolic_equivalent_mets=mets,
            step_or_cycle_count=random.randint(1200, 12000),
            device_source="ARES Bio-Harness / Smartwatch (Simulated)"
        )

    # -----------------------------------------------------------------------
    # WebSocket Real-Time Broadcasting
    # -----------------------------------------------------------------------

    async def connect_websocket(self, websocket: WebSocket, crew_id: str):
        """Accept and register an active WebSocket client for live telemetry streaming."""
        await websocket.accept()
        cid = crew_id.lower()
        self._active_connections[cid].add(websocket)

    def disconnect_websocket(self, websocket: WebSocket, crew_id: str):
        """Remove disconnected WebSocket client."""
        cid = crew_id.lower()
        if websocket in self._active_connections[cid]:
            self._active_connections[cid].remove(websocket)

    async def _broadcast(self, crew_id: str, message: dict):
        """Send message to all clients subscribed to this crew_id or 'all'."""
        subscribers = set(self._active_connections.get(crew_id, set()))
        subscribers.update(self._active_connections.get("all", set()))

        dead_sockets = set()
        for ws in subscribers:
            try:
                await ws.send_json(message)
            except Exception:
                dead_sockets.add(ws)

        for dead in dead_sockets:
            for subs in self._active_connections.values():
                subs.discard(dead)


# Global Singleton Telemetry Manager Instance
telemetry_manager = TelemetryManager()
