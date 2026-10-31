"""Tests for Clinical Risk Modeling and Real-time Wearable Telemetry Integration:
- Nephrolithiasis (Kidney Stones) urinary supersaturation & Potassium Citrate countermeasure
- SANS intracranial pressure, Frisen grade, diopter shift, and LBNP mitigation
- Cardiovascular Orthostatic Intolerance and landing day presyncope
- Wearable sensor telemetry ingestion, circular buffer, acute alarms, and TRIMP strain
- Live WebSocket streaming telemetry and Digital Twin sync
"""
import pytest
from app.simulation import clinical, params as P
from app.telemetry import BiometricReading, SleepArchitectureSample, TelemetryBatch, telemetry_manager


def test_urinary_supersaturation_and_countermeasure():
    """Test CaOx and Brushite supersaturation dynamics with dehydration and Potassium Citrate."""
    # Baseline with low fluid intake (1.4L/day) and 8% bone loss
    base = clinical.urinary_supersaturation(0.08, urine_volume_l=1.4, potassium_citrate_meq=0.0)
    assert base["ca_oxalate_supersaturation"] > 2.0
    assert base["supersaturation_status"] in ("ELEVATED_GROWTH", "SEVERE_NUCLEATION")
    assert base["countermeasure_recommended"] is True

    # With Potassium Citrate (30 mEq) and optimal hydration (2.5L/day)
    treated = clinical.urinary_supersaturation(0.08, urine_volume_l=2.5, potassium_citrate_meq=30.0)
    assert treated["ca_oxalate_supersaturation"] < base["ca_oxalate_supersaturation"]
    assert treated["ca_oxalate_supersaturation"] < 1.5
    assert treated["supersaturation_status"] in ("LOW_RISK", "MODERATE_METASTABLE")


def test_acute_renal_colic_risk_by_phase():
    """Operational incapacitation risk is magnified during high-acceleration landing and EVA phases."""
    transit_colic = clinical.acute_renal_colic_risk(2.5, mission_phase="transit")
    landing_colic = clinical.acute_renal_colic_risk(2.5, mission_phase="landing")
    eva_colic = clinical.acute_renal_colic_risk(2.5, mission_phase="eva")

    assert landing_colic["acute_30d_colic_probability"] > transit_colic["acute_30d_colic_probability"]
    assert eva_colic["acute_30d_colic_probability"] > transit_colic["acute_30d_colic_probability"]


def test_sans_advanced_evaluation_and_lbnp_mitigation():
    """LBNP (Lower Body Negative Pressure) countermeasure attenuates ONSD dilation and ICP elevation."""
    days = 180
    unmitigated = clinical.sans_advanced_evaluation(days, gravity=0.0, lbnp_hours_day=0.0)
    assert unmitigated["onsd_mm"] >= 5.8
    assert unmitigated["status"] == "ELEVATED"
    assert unmitigated["intracranial_pressure_est_mmhg"] > 14.0
    assert unmitigated["hyperopic_shift_diopters"] > 0.4

    # 2.0 hours daily LBNP sessions
    mitigated = clinical.sans_advanced_evaluation(days, gravity=0.0, lbnp_hours_day=2.0)
    assert mitigated["onsd_mm"] < unmitigated["onsd_mm"]
    assert mitigated["intracranial_pressure_est_mmhg"] < unmitigated["intracranial_pressure_est_mmhg"]
    assert mitigated["hyperopic_shift_diopters"] < unmitigated["hyperopic_shift_diopters"]


def test_cardiovascular_orthostatic_intolerance_countermeasures():
    """Pre-landing fluid loading and compression garment mitigate post-flight presyncope."""
    days = 270
    base = clinical.cardiovascular_orthostatic_risk(
        mission_days=days, vo2_loss_pct=15.0, fluid_loading=False, compression_garment=False
    )
    assert base["stand_sbp_drop_mmhg"] >= 12.0
    assert base["presyncope_probability_unmitigated"] > 0.30
    assert base["status"] == "HIGH"

    # With pre-landing fluid loading + antigravity suit
    protected = clinical.cardiovascular_orthostatic_risk(
        mission_days=days, vo2_loss_pct=15.0, fluid_loading=True, compression_garment=True
    )
    assert protected["presyncope_probability_mitigated"] < 0.10
    assert protected["status"] == "LOW"


def test_clinical_countermeasures_api_endpoint(client):
    """Test POST /api/simulation/clinical/countermeasures."""
    payload = {
        "bone_loss_pct": 7.0,
        "mission_days": 180,
        "vo2_loss_pct": 12.0,
        "urine_vol_l": 1.5,
        "potassium_citrate_meq": 30.0,
        "lbnp_hours_day": 2.0,
        "fluid_loading": True,
        "compression_garment": True
    }
    resp = client.post("/api/simulation/clinical/countermeasures", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert "nephrolithiasis" in data
    assert "sans" in data
    assert "orthostatic_intolerance" in data
    assert data["nephrolithiasis"]["supersaturation_reduction_pct"] > 30.0
    assert data["orthostatic_intolerance"]["presyncope_risk_reduction_pct"] > 60.0


def test_telemetry_biometric_ingest_and_alarms(client):
    """Ingesting critical vitals triggers acute life-safety alarms."""
    # Normal reading
    normal = {
        "crew_id": "rahman",
        "heart_rate": 72.0,
        "hrv_rmssd": 65.0,
        "spo2": 98.5,
        "skin_temp_c": 36.6,
        "respiratory_rate": 14.0,
        "active_wattage": 0.0
    }
    r_norm = client.post("/api/telemetry/ingest", json=normal)
    assert r_norm.status_code == 200
    assert len(r_norm.json()["alarms"]) == 0

    # Critical reading: Hypoxia and unprovoked resting tachycardia
    critical = {
        "crew_id": "rahman",
        "heart_rate": 180.0,
        "hrv_rmssd": 12.0,
        "spo2": 88.0,
        "skin_temp_c": 39.0,
        "respiratory_rate": 32.0,
        "active_wattage": 0.0
    }
    r_crit = client.post("/api/telemetry/ingest", json=critical)
    assert r_crit.status_code == 200
    alarms = r_crit.json()["alarms"]
    alarm_codes = [a["code"] for a in alarms]
    assert "HYPOXIA_ALERT" in alarm_codes
    assert "UNPROVOKED_TACHYCARDIA" in alarm_codes
    assert "ACUTE_AUTONOMIC_STRAIN" in alarm_codes
    assert "THERMAL_STRAIN_HYPERTHERMIA" in alarm_codes


def test_telemetry_batch_ingest_and_history(client):
    """Batch ingestion buffers multiple readings and history endpoint retrieves them."""
    readings = [
        {
            "crew_id": "tanaka",
            "heart_rate": 140.0 + i,
            "hrv_rmssd": 25.0,
            "spo2": 97.5,
            "skin_temp_c": 37.1,
            "respiratory_rate": 26.0,
            "active_wattage": 160.0
        }
        for i in range(10)
    ]
    batch_resp = client.post("/api/telemetry/batch", json={"crew_id": "tanaka", "readings": readings})
    assert batch_resp.status_code == 200
    assert batch_resp.json()["readings_count"] == 10

    hist_resp = client.get("/api/telemetry/history/tanaka?limit=5")
    assert hist_resp.status_code == 200
    assert hist_resp.json()["count"] == 5


def test_telemetry_sleep_ingest_and_summary(client):
    """Sleep session ingestion updates 24h summary and recovery metrics."""
    sleep_payload = {
        "crew_id": "silva",
        "night_start": "2024-05-01T22:00:00Z",
        "night_end": "2024-05-02T06:00:00Z",
        "total_sleep_hours": 8.0,
        "deep_sleep_hours": 2.1,
        "rem_sleep_hours": 1.8,
        "light_sleep_hours": 4.1,
        "awakenings_count": 2,
        "sleep_efficiency_pct": 91.0,
        "hrv_overnight_recovery": 72.0
    }
    sleep_resp = client.post("/api/telemetry/sleep", json=sleep_payload)
    assert sleep_resp.status_code == 200
    assert sleep_resp.json()["total_sleep_hours"] == 8.0

    sum_resp = client.get("/api/telemetry/summary/silva")
    assert sum_resp.status_code == 200
    summary = sum_resp.json()
    assert summary["latest_sleep"]["total_hours"] == 8.0
    assert summary["latest_sleep"]["deep_hours"] == 2.1


def test_simulated_stream_and_trimp_strain(client):
    """Simulated workout stream populates buffer and computes TRIMP cardiovascular load."""
    sim_resp = client.post("/api/telemetry/simulate/okafor", json={"crew_id": "okafor", "activity_type": "exercise", "samples_count": 15})
    assert sim_resp.status_code == 200
    assert sim_resp.json()["samples_ingested"] == 15

    sum_resp = client.get("/api/telemetry/summary/okafor")
    assert sum_resp.status_code == 200
    sum_data = sum_resp.json()
    assert sum_data["has_live_telemetry"] is True
    assert sum_data["mean_heart_rate_bpm"] > 100.0
    assert sum_data["buffer_samples_count"] >= 15


def test_telemetry_websocket_streaming(client):
    """WebSocket connection establishes and handles bidirectional communication."""
    with client.websocket_connect("/api/telemetry/ws/rahman") as ws:
        init_data = ws.receive_json()
        assert init_data["type"] == "CONNECTION_ESTABLISHED"
        assert init_data["crew_id"] == "rahman"

        ws.send_text("ping")
        reply = ws.receive_text()
        assert reply == "pong"
