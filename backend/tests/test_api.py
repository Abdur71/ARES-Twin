"""End-to-end API tests (offline space weather, temporary database)."""


def test_mission_clock(client):
    r = client.get("/api/mission").json()
    assert r["current_day"] == 120 and r["mission_days"] == 270
    assert r["current_date"] == "2024-04-30"
    assert r["comm_delay_min"] > 0


def test_crew_overview(client):
    r = client.get("/api/crew").json()
    assert len(r["crew"]) == 4
    for card in r["crew"]:
        assert card["profile"]["simulated"] is True
        assert card["arrival"]["status"] in {"GREEN", "AMBER", "RED"}
        assert 0 <= card["arrival"]["readiness"]["p50"] <= 100
        assert card["radiation"]["used_msv"] >= card["profile"]["prior_dose_msv"]
    silva = next(c for c in r["crew"] if c["profile"]["id"] == "silva")
    okafor = next(c for c in r["crew"] if c["profile"]["id"] == "okafor")
    assert silva["arrival"]["readiness"]["p50"] < okafor["arrival"]["readiness"]["p50"]


def test_crew_detail(client):
    r = client.get("/api/crew/rahman").json()
    assert len(r["series"]["readiness"]["p50"]) == 271
    assert len(r["series"]["dose"]) == 271
    assert r["series"]["bone"]["p5"][-1] <= r["series"]["bone"]["p50"][-1] <= r["series"]["bone"]["p95"][-1]
    assert r["comm"]["day"] == 120
    assert client.get("/api/crew/rahman?gcr_scenario=measured").json()["radiation"]["arrival_msv"] > \
        r["radiation"]["arrival_msv"]


def test_unknown_crew_and_bad_day(client):
    assert client.get("/api/crew/nobody").status_code == 404
    assert client.get("/api/crew?day=999").status_code == 422


def test_logs(client):
    logs = client.get("/api/crew/silva/logs").json()
    assert len(logs["sleep_h"]) == 270
    assert all(m == 0 for m in logs["resistance_min"][60:81])  # wrist injury block
    assert "Wrist sprain" in logs["events"][65]


def test_measurement_updates_posterior(client):
    before = client.get("/api/crew/tanaka").json()["rates"]["bone"]
    m = client.post("/api/crew/tanaka/measurements", json={"day": 90, "metric": "bone", "value": 0.99 * 0.94})
    assert m.status_code == 201
    after = client.get("/api/crew/tanaka").json()["rates"]["bone"]
    assert after["posterior_mean"] > before["posterior_mean"]  # faster loss than the prior expected
    assert after["posterior_sd"] < before["posterior_sd"]
    assert client.delete(f"/api/crew/tanaka/measurements/{m.json()['id']}").status_code == 204
    assert client.get("/api/crew/tanaka/measurements").json() == []


def test_implausible_measurement_rejected(client):
    r = client.post("/api/crew/tanaka/measurements", json={"day": 90, "metric": "cardio", "value": 5})
    assert r.status_code == 422


def test_whatif_injury_reduces_readiness(client):
    body = {"crew_id": "rahman", "resistance_days": 7, "cardio_min": 60, "sleep_h": 6.8, "adherence": 0.95,
            "injury_start": 125, "injury_days": 21}
    r = client.post("/api/whatif", json=body).json()
    assert r["delta"]["readiness"] < 0
    assert r["delta"]["muscle"] > 0
    assert len(r["summary"]) == 5


def test_whatif_shelter_matters(client):
    storm = {"day": 150, "peak_pfu": 20000}
    base = {"crew_id": "rahman", "resistance_days": 7, "cardio_min": 60, "sleep_h": 6.8, "adherence": 0.95}
    out = client.post("/api/whatif", json={**base, "storm": {**storm, "sheltered": False}}).json()
    inn = client.post("/api/whatif", json={**base, "storm": {**storm, "sheltered": True}}).json()
    assert out["delta"]["arrival_dose_msv"] > inn["delta"]["arrival_dose_msv"] > 0


def test_whatif_validation(client):
    assert client.post("/api/whatif", json={"crew_id": "rahman", "injury_days": 10}).status_code == 422
    assert client.post("/api/whatif", json={"crew_id": "rahman", "resistance_days": 9}).status_code == 422


def test_optimizer_from_mission_start(client):
    r = client.post("/api/optimize", json={"crew_id": "okafor", "day": 0, "goal_readiness": 75}).json()
    assert r["plans_evaluated"] == 56 and len(r["grid"]) == 56
    assert r["best"] is not None
    assert r["best"]["weekly_minutes"] <= r["default_weekly_minutes"]
    assert r["best"]["probability"] >= 0.9


def test_optimizer_reports_infeasible_goal(client):
    r = client.post("/api/optimize", json={"crew_id": "silva", "goal_readiness": 95}).json()
    assert r["best"] is None and "No plan" in r["message"]


def test_twin_experiment(client):
    r = client.post("/api/twin/experiment", json={"crew_id": "rahman", "seed": 5}).json()
    assert len(r["steps"]) == len(r["checkup_days"]) + 1
    assert r["steps"][-1]["posterior"]["bone"]["sd"] < r["steps"][0]["posterior"]["bone"]["sd"]
    for v in r["calibration"]["coverage"].values():  # 90 % bands should hold the truth ~90 % of the time
        assert 0.8 <= v <= 0.98


def test_model_and_spaceweather(client):
    m = client.get("/api/model").json()
    assert m["readiness"]["limits"]["cardio"] == 0.4
    assert len(m["dose_map"]) == 5
    sw = client.get("/api/spaceweather").json()
    assert len(sw["trajectory"]) == 271
    assert set(sw["sources"]) == {"donki_sep", "donki_flr", "noaa_spe_list", "jpl_horizons"}
