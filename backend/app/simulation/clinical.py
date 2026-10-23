"""Clinical spaceflight risk models: Nephrolithiasis (Kidney Stones) and SANS (Spaceflight-Associated Neuro-ocular Syndrome).

All models operate vectorised over Monte Carlo runs (shape: (runs, days+1) or (runs,)).
"""
import numpy as np

from app.simulation import params as P


def urinary_calcium_excretion(bone_loss, baseline_mg: float = P.CA_EXCRETION_BASE_MG):
    """24-hour urinary calcium excretion (mg/day).
    
    In microgravity, osteoclast-mediated bone demineralization releases ionized calcium
    into extracellular fluid, resulting in progressive hypercalciuria (Whitson et al.).
    """
    loss = np.maximum(0.0, np.asarray(bone_loss, dtype=float))
    return baseline_mg + P.CA_EXCRETION_BONE_FACTOR * loss * 10.0


def kidney_stone_relative_risk(bone_loss, hydration_multiplier: float = 1.0):
    """Relative risk of calcium oxalate/phosphate renal calculi formation compared to 1g terrestrial baseline.
    
    Driven by hypercalciuria supersaturation and urinary flow rate/hydration status.
    """
    ca = urinary_calcium_excretion(bone_loss)
    ca_ratio = ca / P.CA_EXCRETION_BASE_MG
    hyd = np.clip(np.asarray(hydration_multiplier, dtype=float), 0.5, 2.0)
    # Supersaturation follows non-linear power curve with solute concentration
    rr = (ca_ratio ** 1.8) * (hyd ** -1.5)
    return np.round(rr, 2)


def kidney_stone_cumulative_probability(bone_loss_timeline, daily_hydration=None):
    """Cumulative probability of symptomatic nephrolithiasis event over the mission duration.
    
    timeline shape: (runs, days+1) or (days+1,).
    """
    timeline = np.asarray(bone_loss_timeline, dtype=float)
    if daily_hydration is None:
        daily_hydration = np.ones(timeline.shape[-1])
    
    rr = kidney_stone_relative_risk(timeline, daily_hydration)
    daily_hazard = rr * P.STONE_BASELINE_INCIDENCE
    # Survival function S(t) = exp(-sum(hazard))
    if timeline.ndim > 1:
        cum_hazard = np.cumsum(daily_hazard, axis=-1)
    else:
        cum_hazard = np.cumsum(daily_hazard)
    return np.round(1.0 - np.exp(-cum_hazard), 4)


def sans_onsd_trajectory(microgravity_days_array, gravity_array=None):
    """Optic Nerve Sheath Diameter (ONSD, in mm) trajectory over time.
    
    Microgravity cephalad fluid shift eliminates hydrostatic gradient, causing internal
    jugular venous congestion, elevated retrobulbar subarachnoid pressure, and sheath expansion.
    On Mars (0.38g), partial downward hydrostatic pressure halts and partially relieves engorgement.
    """
    days = np.asarray(microgravity_days_array, dtype=float)
    if gravity_array is None:
        g_unloading = np.ones_like(days)
    else:
        g_unloading = np.clip(1.0 - np.asarray(gravity_array, dtype=float), 0.0, 1.0)
    
    expansion = P.ONSD_MAX_DELTA_MM * (1.0 - np.exp(-days / P.SANS_TAU_DAYS)) * g_unloading
    return np.round(P.ONSD_BASELINE_MM + expansion, 2)


def sans_severity_classification(onsd_mm):
    """Categorize SANS papilledema risk according to optic nerve sheath diameter threshold."""
    onsd = np.asarray(onsd_mm, dtype=float)
    grade = np.where(
        onsd >= P.SANS_GRADE2_THRESH_MM,
        "Grade 2+ (Moderate-to-Severe Edema Risk)",
        np.where(onsd >= P.SANS_GRADE1_THRESH_MM, "Grade 1 (Mild Optic Disc Edema Risk)", "Grade 0 (Subclinical/Normal)")
    )
    return str(grade) if grade.ndim == 0 else grade.tolist()


def clinical_summary(bone_loss_final, mission_days: int, gravity: float = 1.0) -> dict:
    """Clinical risk assessment summary for arrival or check-up day."""
    med_bone_loss = float(np.median(bone_loss_final))
    ca_mg = float(urinary_calcium_excretion(med_bone_loss))
    stone_rr = float(kidney_stone_relative_risk(med_bone_loss))
    
    # Cumulative risk estimate for the elapsed mission
    cum_stone_p = float(1.0 - np.exp(-stone_rr * P.STONE_BASELINE_INCIDENCE * mission_days))
    stone_status = "HIGH" if stone_rr >= P.STONE_RISK_HIGH_THRESH else ("MODERATE" if stone_rr >= 1.5 else "LOW")
    
    onsd = float(sans_onsd_trajectory(mission_days, gravity))
    sans_status = sans_severity_classification(onsd)
    
    return {
        "kidney_stone": {
            "urinary_calcium_mg_day": round(ca_mg, 1),
            "baseline_calcium_mg_day": P.CA_EXCRETION_BASE_MG,
            "calcium_elevation_pct": round(((ca_mg / P.CA_EXCRETION_BASE_MG) - 1.0) * 100, 1),
            "relative_risk": round(stone_rr, 2),
            "cumulative_probability": round(cum_stone_p, 4),
            "status": stone_status,
        },
        "sans": {
            "onsd_mm": round(onsd, 2),
            "baseline_onsd_mm": P.ONSD_BASELINE_MM,
            "sheath_expansion_mm": round(onsd - P.ONSD_BASELINE_MM, 2),
            "severity": sans_status,
            "status": "ELEVATED" if onsd >= P.SANS_GRADE1_THRESH_MM else "NORMAL",
        }
    }
