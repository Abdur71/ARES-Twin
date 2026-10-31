"""External Data Pipelines API Router: NASA OSDR RadLab Dosimeters & CDC NHANES Population Baselines."""
from typing import Literal
from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from app.pipelines import (
    compare_with_simulation,
    fetch_radlab_catalog,
    generate_virtual_cohort,
    nhanes_distribution_catalog,
    sample_astronaut_profile,
)

router = APIRouter(prefix="/pipelines", tags=["External Pipelines"])


@router.get("/radlab/studies")
async def radlab_studies(refresh: bool = Query(False, description="Bypass cache and re-query OSDR metadata")):
    """NASA Open Science Data Repository (OSDR) RadLab spaceflight dosimeter catalog and benchmarks."""
    return await fetch_radlab_catalog(refresh=refresh)


@router.get("/radlab/benchmark")
def radlab_benchmark(
    scenario: Literal["design_goal", "measured"] = Query("measured", description="GCR scenario in ARES Twin"),
    phase: Literal["transit", "surface"] = Query("transit", description="Mission phase benchmark")
):
    """Direct comparison between ARES Twin daily dose model and flight dosimeter ground truth (MSL/RAD & ISS)."""
    return compare_with_simulation(gcr_scenario=scenario, mission_phase=phase)


@router.get("/nhanes/distributions")
def nhanes_distributions():
    """CDC NHANES adult reference distributions for hip BMD, DXA leg lean mass, and VO2peak fitness."""
    return nhanes_distribution_catalog()


class NhanesSampleIn(BaseModel):
    sex: Literal["male", "female"] = "male"
    age: int = Field(42, ge=25, le=60)
    fitness_percentile: float = Field(0.75, ge=0.05, le=0.99)
    seed: int | None = None


@router.get("/nhanes/sample")
def nhanes_sample(
    sex: Literal["male", "female"] = Query("male"),
    age: int = Query(42, ge=25, le=60),
    fitness_percentile: float = Query(0.75, ge=0.05, le=0.99),
    seed: int | None = Query(None)
):
    """Statistically draw a single astronaut candidate baseline from CDC NHANES multi-variable distributions."""
    return sample_astronaut_profile(sex=sex, age=age, fitness_percentile=fitness_percentile, seed=seed)


@router.get("/nhanes/cohort")
def nhanes_cohort(
    cohort_size: int = Query(4, ge=1, le=8),
    seed: int = Query(42)
):
    """Generate a full synthetic virtual crew drawn probabilistically from CDC NHANES population statistics."""
    return {
        "source": "CDC NHANES Empirical Population Sampler",
        "cohort_size": cohort_size,
        "crew": generate_virtual_cohort(cohort_size=cohort_size, seed=seed)
    }
