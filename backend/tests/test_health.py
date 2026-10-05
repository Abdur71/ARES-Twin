"""Unit and integration tests for ARES Twin Health API."""
import pytest
from starlette.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_check_status_code():
    """Verify that /api/health responds with HTTP 200."""
    response = client.get("/api/health")
    assert response.status_code == 200


def test_health_check_payload():
    """Verify that /api/health returns the exact specification contract."""
    response = client.get("/api/health")
    data = response.json()
    assert data == {
        "status": "ok",
        "service": "ARES Twin Backend"
    }


def test_root_endpoint():
    """Verify that root / provides links and project metadata."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "project" in data
    assert data["project"] == "ARES Twin"
    assert data["health"] == "/api/health"


def test_cors_preflight():
    """Verify CORS preflight handling for frontend origin."""
    response = client.options(
        "/api/health",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET"
        }
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"
