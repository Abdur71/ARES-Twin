"""CDC NHANES (National Health and Nutrition Examination Survey) Baseline Pipeline.

Derives realistic astronaut physical baselines from CDC NHANES datasets:
- Dual-energy X-ray Absorptiometry (DXA) examination data:
    * Total hip and femoral neck BMD (g/cm^2, T-score, Z-score)
    * Appendicular Lean Mass (ALM) and leg lean mass (kg)
- Cardiorespiratory Fitness examination data:
    * Cycle-ergometer / treadmill peak oxygen uptake (VO2peak, mL/kg/min)
- Calibrated against NASA Astronaut Candidate Selection criteria (Class of 2017/2021/2024 cohorts).
"""
from dataclasses import dataclass
from typing import Literal
import numpy as np


# NHANES-derived parameter distributions for physically fit adults (Ages 30–50)
# Sources: Looker et al., Osteoporosis Int 2012; Kelly et al., J Clin Densitom 2009; Wang et al., MSSE 2010.
NHANES_FIT_COHORTS = {
    "male": {
        "age_range": (30, 50),
        "height_cm": {"mean": 178.5, "sd": 6.8},
        "weight_kg": {"mean": 79.2, "sd": 8.5},
        "hip_bmd_g_cm2": {"mean": 1.055, "sd": 0.125, "p5": 0.86, "p50": 1.05, "p95": 1.28},
        "spine_bmd_g_cm2": {"mean": 1.080, "sd": 0.130, "p5": 0.88, "p50": 1.08, "p95": 1.30},
        "leg_lean_kg": {"mean": 19.8, "sd": 2.4, "p5": 16.0, "p50": 19.7, "p95": 24.0},
        "vo2peak_ml_kg_min": {"mean": 45.8, "sd": 5.4, "p5": 37.5, "p50": 45.5, "p95": 55.0},
        "urinary_calcium_base_mg": {"mean": 195.0, "sd": 45.0}
    },
    "female": {
        "age_range": (30, 50),
        "height_cm": {"mean": 166.2, "sd": 6.2},
        "weight_kg": {"mean": 63.8, "sd": 7.2},
        "hip_bmd_g_cm2": {"mean": 0.985, "sd": 0.115, "p5": 0.80, "p50": 0.98, "p95": 1.19},
        "spine_bmd_g_cm2": {"mean": 1.020, "sd": 0.120, "p5": 0.83, "p50": 1.01, "p95": 1.22},
        "leg_lean_kg": {"mean": 15.6, "sd": 1.9, "p5": 12.8, "p50": 15.5, "p95": 19.0},
        "vo2peak_ml_kg_min": {"mean": 41.2, "sd": 4.8, "p5": 34.0, "p50": 41.0, "p95": 49.5},
        "urinary_calcium_base_mg": {"mean": 165.0, "sd": 40.0}
    }
}


def sample_astronaut_profile(
    sex: Literal["male", "female"] = "male",
    age: int = 42,
    fitness_percentile: float = 0.75,
    seed: int | None = None
) -> dict:
    """Draw a statistically consistent virtual astronaut candidate baseline from NHANES distributions."""
    rng = np.random.default_rng(seed)
    cohort = NHANES_FIT_COHORTS[sex]
    
    # Rational approximation of inverse normal CDF (probit) for percentile rank
    p = float(np.clip(fitness_percentile, 0.01, 0.99))
    # Approximation of normal quantile without external scipy dependency
    t = np.sqrt(-2.0 * np.log(min(p, 1.0 - p)))
    # Abramowitz and Stegun formula 26.2.23
    c0, c1, c2 = 2.515517, 0.802853, 0.010328
    d1, d2, d3 = 1.432788, 0.189269, 0.001308
    z_approx = t - ((c2 * t + c1) * t + c0) / (((d3 * t + d2) * t + d1) * t + 1.0)
    z_score = float(z_approx if p >= 0.5 else -z_approx)
    
    # Sample correlated biometric traits with random residual variation
    bmd_sample = float(cohort["hip_bmd_g_cm2"]["mean"] + 0.6 * z_score * cohort["hip_bmd_g_cm2"]["sd"] + rng.normal(0, 0.04))
    leg_sample = float(cohort["leg_lean_kg"]["mean"] + 0.7 * z_score * cohort["leg_lean_kg"]["sd"] + rng.normal(0, 0.8))
    vo2_sample = float(cohort["vo2peak_ml_kg_min"]["mean"] + 0.8 * z_score * cohort["vo2peak_ml_kg_min"]["sd"] + rng.normal(0, 1.5))
    
    # Clinical DXA T-Score (referenced against young adult healthy reference mean ~1.00 g/cm^2, SD 0.12)
    t_score = (bmd_sample - 1.00) / 0.12
    
    # Rate parameters drawn within published NASA flight ranges
    r_bone_month = float(np.clip(0.0125 * rng.lognormal(0, 0.12), 0.009, 0.016))
    muscle_sens = "normal" if abs(z_score) < 0.8 else ("low" if z_score > 0.8 else "high")
    
    return {
        "demographics": {
            "sex": sex,
            "age": age,
            "fitness_tier": "ELITE" if fitness_percentile >= 0.85 else ("SUPERIOR" if fitness_percentile >= 0.65 else "GOOD"),
            "percentile_rank": round(fitness_percentile * 100, 1),
        },
        "baseline": {
            "hip_bmd": round(bmd_sample, 3),
            "leg_lean_kg": round(leg_sample, 2),
            "vo2peak": round(vo2_sample, 1),
        },
        "clinical_markers": {
            "dxa_t_score": round(t_score, 2),
            "dxa_classification": "Normal Bone Mineral Density" if t_score >= -1.0 else "Osteopenia",
            "urinary_calcium_base_mg_day": round(cohort["urinary_calcium_base_mg"]["mean"] + rng.normal(0, 15), 1),
        },
        "simulated_traits": {
            "r_bone_hip_month": round(r_bone_month, 4),
            "r_bone_hip_pct_month": round(r_bone_month * 100, 2),
            "muscle_sensitivity": muscle_sens,
            "recommended_adherence": round(float(np.clip(0.85 + 0.1 * z_score, 0.70, 0.98)), 2)
        }
    }


def generate_virtual_cohort(cohort_size: int = 4, seed: int = 42) -> list[dict]:
    """Generate an entire synthetic crew drawn from CDC NHANES distributions."""
    rng = np.random.default_rng(seed)
    crew = []
    names = [
        ("CDR Vance", "Commander", "male", 46),
        ("Dr. Evans", "Medical Officer", "female", 39),
        ("Eng. Chen", "Flight Engineer", "male", 41),
        ("Sci. Rossi", "Science Specialist", "female", 36),
    ]
    for i in range(min(cohort_size, len(names))):
        name, role, sex, age = names[i]
        fit_p = float(rng.uniform(0.65, 0.95))
        prof = sample_astronaut_profile(sex=sex, age=age, fitness_percentile=fit_p, seed=int(rng.integers(1, 10000)))
        crew.append({
            "id": name.lower().split()[-1],
            "name": name,
            "role": role,
            **prof
        })
    return crew


def nhanes_distribution_catalog() -> dict:
    """Return complete CDC NHANES reference parameters for frontend inspection."""
    return {
        "dataset": "CDC NHANES Continuous (2011–2020) Dual-Energy X-Ray Absorptiometry & Fitness",
        "cohorts": NHANES_FIT_COHORTS,
        "selection_standards": {
            "nasa_std_3001": "Astronaut Candidate Baseline Medical Standards Volume 1",
            "bmd_cutoff": "T-score >= -1.0 (no pre-existing osteopenia)",
            "vo2peak_cutoff": ">= 35.0 mL/kg/min (Female), >= 40.0 mL/kg/min (Male)",
        }
    }
