"""ARES Twin — FastAPI Application Entrypoint."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config.settings import settings
from app.api.health import router as health_router

app = FastAPI(
    title=settings.PROJECT_NAME,
    description=(
        "ARES Twin — Astronaut Digital Twin Simulator & Decision-Support System "
        "for Mars Missions. Research & Simulation Prototype."
    ),
    version=settings.VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

# Configure CORS for Next.js frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS if isinstance(settings.CORS_ORIGINS, list) else [settings.CORS_ORIGINS],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers under /api prefix
app.include_router(health_router, prefix="/api")


@app.get("/", tags=["Root"])
def root():
    """Root endpoint welcoming operators to ARES Twin API."""
    return {
        "project": settings.PROJECT_NAME,
        "service": settings.SERVICE_NAME,
        "version": settings.VERSION,
        "docs": "/docs",
        "health": "/api/health"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=settings.DEBUG)
