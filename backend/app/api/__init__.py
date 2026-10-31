"""API Routers Package."""
from app.api.crew import router as crew_router
from app.api.health import router as health_router
from app.api.orbit import router as orbit_router
from app.api.pipelines import router as pipelines_router
from app.api.simulation import router as simulation_router
from app.api.spaceweather import router as mission_router
from app.api.telemetry import router as telemetry_router

__all__ = ["crew_router", "health_router", "mission_router", "orbit_router", "pipelines_router", "simulation_router", "telemetry_router"]
