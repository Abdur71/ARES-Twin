"""Application settings and environment configuration."""
from pathlib import Path
from typing import List, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "ARES Twin"
    SERVICE_NAME: str = "ARES Twin Backend"
    VERSION: str = "0.1.0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    
    # CORS Configuration
    CORS_ORIGINS: Union[List[str], str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000"
    ]
    
    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",") if i.strip()]
        elif isinstance(v, (list, str)):
            return v
        return ["http://localhost:3000", "http://127.0.0.1:3000"]

    # Database (a relative SQLite path is resolved against backend/, not the working directory)
    DATABASE_URL: str = "sqlite:///./ares_twin.db"

    # External APIs
    NASA_API_KEY: str = "DEMO_KEY"  # only for api.nasa.gov services; DONKI no longer needs it
    DONKI_API_BASE: str = "https://ccmc.gsfc.nasa.gov/DONKI-API/get"
    NOAA_SEP_LIST_URL: str = (
        "https://www.ngdc.noaa.gov/stp/space-weather/interplanetary-data/solar-proton-events/SEP%20page%20code.html"
    )
    HORIZONS_API_URL: str = "https://ssd.jpl.nasa.gov/api/horizons.api"
    SPACEWEATHER_OFFLINE: bool = False  # True → use cached JSON only, never call external APIs
    HTTP_TIMEOUT_S: float = 25.0

    # Mission replay window: the crew lives through the real space weather of these dates
    MISSION_START: str = "2024-01-01"
    MISSION_CURRENT_DAY: int = 120  # "today" in mission days

    @property
    def database_url(self) -> str:
        prefix = "sqlite:///./"
        if self.DATABASE_URL.startswith(prefix):
            backend_dir = Path(__file__).resolve().parents[2]
            return f"sqlite:///{(backend_dir / self.DATABASE_URL[len(prefix):]).as_posix()}"
        return self.DATABASE_URL

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )


settings = Settings()
