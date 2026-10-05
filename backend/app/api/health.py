"""Health check endpoint for ARES Twin."""
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["System"])


class HealthResponse(BaseModel):
    status: str
    service: str


@router.get("/health", response_model=HealthResponse)
def get_health() -> HealthResponse:
    """Return system operational status and service identifier."""
    return HealthResponse(
        status="ok",
        service="ARES Twin Backend"
    )
