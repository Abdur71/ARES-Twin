"""Clinical spaceflight risk models:
1. Nephrolithiasis (Kidney Stones) & Urinary Supersaturation Dynamics
2. SANS (Spaceflight-Associated Neuro-ocular Syndrome) & Intracranial Pressure
3. Cardiovascular Orthostatic Intolerance & Mars Landing Presyncope Risk

Operates vectorised over Monte Carlo runs or single scalar trajectories.
Calibrated against published NASA Human Research Program (HRP) Evidence Reports.
"""
import numpy as np
from app.simulation import params as P


# ===========================================================================
# 1. Nephrolithiasis (Kidney Stones) & Hypercalciuria Supersaturation
# ===========================================================================

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


def urinary_supersaturation(
    bone_loss,
    urine_volume_l: float = P.URINE_VOL_BASE_L,
    potassium_citrate_meq: float = 0.0,
    high_sodium: bool = False
) -> dict:
    """Detailed biochemical urinary supersaturation index for Calcium Oxalate and Brushite.
    
    References:
    - Whitson et al. (NASA JSC): Spaceflight-induced hypercalciuria and nephrolithiasis risk.
    - Curhan et al.: 24-hour urine chemistries and risk of kidney stones.
    """
    ca_mg = float(np.mean(urinary_calcium_excretion(bone_loss)))
    vol = max(0.5, float(urine_volume_l))
    
    # Calcium concentration in mmol/L
    ca_conc_mmol_l = (ca_mg / 40.08) / vol
    
    # Potassium citrate countermeasure reduces free Ca2+ by chelation and increases urinary pH
    citrate_reduction = min(0.60, (potassium_citrate_meq / 30.0) * P.K_CITRATE_SS_REDUCTION)
    citrate_factor = 1.0 - citrate_reduction
    
    # High dietary sodium increases calcium excretion and reduces proximal tubule reabsorption
    na_factor = 1.15 if high_sodium else 1.0
    
    # Relative supersaturation (SS) ratios
    vol_ratio = (P.URINE_VOL_BASE_L / vol) ** 1.3
    ca_ratio = ca_mg / P.CA_EXCRETION_BASE_MG
    
    ss_caox = P.CA_OXALATE_BASE_SS * ca_ratio * vol_ratio * citrate_factor * na_factor
    ss_brushite = P.BRUSHITE_BASE_SS * ca_ratio * (P.URINE_VOL_BASE_L / vol) * (0.85 if potassium_citrate_meq > 0 else 1.0)
    
    if ss_caox >= 4.0:
        ss_status = "SEVERE_NUCLEATION"
        risk_desc = "Spontaneous homogeneous crystal nucleation zone"
    elif ss_caox >= 2.5:
        ss_status = "ELEVATED_GROWTH"
        risk_desc = "Metastable upper limit: active crystal growth and agglomeration"
    elif ss_caox >= 1.5:
        ss_status = "MODERATE_METASTABLE"
        risk_desc = "Metastable zone: crystallization possible with nidus"
    else:
        ss_status = "LOW_RISK"
        risk_desc = "Undersaturated to low metastable: stone formation improbable"
        
    return {
        "urinary_calcium_mg_day": round(ca_mg, 1),
        "urine_volume_l": round(vol, 2),
        "calcium_concentration_mmol_l": round(ca_conc_mmol_l, 2),
        "ca_oxalate_supersaturation": round(float(ss_caox), 2),
        "brushite_supersaturation": round(float(ss_brushite), 2),
        "supersaturation_status": ss_status,
        "risk_description": risk_desc,
        "potassium_citrate_meq": potassium_citrate_meq,
        "countermeasure_recommended": ss_caox >= 2.0 or vol < 2.0
    }


def acute_renal_colic_risk(relative_risk: float, mission_phase: str = "transit") -> dict:
    """Probability of acute renal colic attack causing mission operational incapacitation.
    
    During high-acceleration phases (EDL landing, Mars EVA), dislodged calculi present critical risk.
    """
    phase_multipliers = {
        "transit": 1.0,
        "eva": 1.4,         # Heavy physical movement and localized dehydration
        "landing": 1.8,     # High sustained +Gx/+Gz deceleration forces dislodging calculi
        "surface": 1.1
    }
    mult = phase_multipliers.get(mission_phase.lower(), 1.0)
    acute_prob_30d = 1.0 - np.exp(-relative_risk * P.STONE_BASELINE_INCIDENCE * 30.0 * mult)
    
    return {
        "mission_phase": mission_phase,
        "phase_strain_multiplier": mult,
        "acute_30d_colic_probability": round(float(acute_prob_30d), 4),
        "eva_incapacitation_risk": "HIGH" if acute_prob_30d > 0.02 else ("MODERATE" if acute_prob_30d > 0.008 else "LOW")
    }


# ===========================================================================
# 2. SANS (Spaceflight-Associated Neuro-ocular Syndrome) & Intracranial Dynamics
# ===========================================================================

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


def sans_advanced_evaluation(
    microgravity_days: float,
    gravity: float = 0.0,
    lbnp_hours_day: float = 0.0
) -> dict:
    """Comprehensive SANS clinical evaluation: ONSD, Intracranial Pressure (ICP),
    Modified Frisen Grade, Refractive Diopter Shift, and LBNP countermeasure mitigation.
    
    References:
    - Mader et al. (2011), Lee et al. (2020): Optic disc edema, globe flattening, choroidal folds.
    - Stenger et al. (2017): Lower Body Negative Pressure (LBNP) as countermeasure for SANS.
    """
    days = max(0.0, float(microgravity_days))
    g = float(gravity)
    g_unloading = max(0.0, min(1.0, 1.0 - g))
    
    # LBNP (Lower Body Negative Pressure) countermeasure: 25-35 mmHg for 2h/day shifts blood caudad
    lbnp_eff = min(1.0, float(lbnp_hours_day) / 2.0) * P.LBNP_DAILY_EFFICIENCY
    net_unloading = g_unloading * (1.0 - lbnp_eff)
    
    expansion = P.ONSD_MAX_DELTA_MM * (1.0 - np.exp(-days / P.SANS_TAU_DAYS)) * net_unloading
    onsd = P.ONSD_BASELINE_MM + expansion
    
    # Frisen Papilledema Grade
    if onsd >= P.SANS_GRADE3_THRESH_MM:
        frisen_grade = "Grade 3 (Severe papilledema, vessel obscuration)"
    elif onsd >= P.SANS_GRADE2_THRESH_MM:
        frisen_grade = "Grade 2 (Circumferential 360° halo disc edema)"
    elif onsd >= P.SANS_GRADE1_THRESH_MM:
        frisen_grade = "Grade 1 (C-shaped halo, mild disc margin blurring)"
    else:
        frisen_grade = "Grade 0 (Normal optic disc, no edema)"
        
    # Intracranial / Retrobulbar Pressure Estimate (mmHg)
    # Baseline terrestrial supine ~10 mmHg; microgravity cephalad shift adds up to +6.5 mmHg
    icp_delta = 6.5 * (1.0 - np.exp(-days / 30.0)) * net_unloading
    icp_est = 10.0 + icp_delta
    
    # Hyperopic refractive shift (Diopters) from posterior globe flattening
    diopter_shift = round(P.MAX_DIOPTER_SHIFT * (expansion / P.ONSD_MAX_DELTA_MM), 2)
    
    # Choroidal folds probability (sigmoidal response to ONSD dilation)
    folds_prob = round(float(1.0 / (1.0 + np.exp(-6.0 * (onsd - 5.85)))), 3)
    
    return {
        "microgravity_days": round(days, 1),
        "ambient_gravity_g": round(g, 2),
        "lbnp_countermeasure_hours_day": round(float(lbnp_hours_day), 1),
        "onsd_mm": round(float(onsd), 2),
        "baseline_onsd_mm": P.ONSD_BASELINE_MM,
        "sheath_expansion_mm": round(float(expansion), 2),
        "frisen_grade": frisen_grade,
        "intracranial_pressure_est_mmhg": round(float(icp_est), 1),
        "hyperopic_shift_diopters": diopter_shift,
        "choroidal_folds_probability": folds_prob,
        "status": "ELEVATED" if onsd >= P.SANS_GRADE1_THRESH_MM else "NORMAL"
    }


# ===========================================================================
# 3. Cardiovascular Orthostatic Intolerance (Mars Landing / Presyncope)
# ===========================================================================

def cardiovascular_orthostatic_risk(
    mission_days: float,
    vo2_loss_pct: float = 0.0,
    fluid_loading: bool = False,
    compression_garment: bool = False,
    target_gravity: float = P.GRAVITY_MARS
) -> dict:
    """Evaluates cardiovascular orthostatic intolerance risk upon landing under target gravity.
    
    Mechanisms:
    - Hypovolemia: microgravity plasma volume contraction (~10-15%).
    - Baroreflex Sensitivity (BRS) attenuation.
    - Postural Systolic Blood Pressure Drop (ΔSBP) and Heart Rate spike (ΔHR) on stand test.
    - Presyncope / Syncope probability on landing day.
    
    References:
    - Buckey et al.: Orthostatic intolerance after spaceflight.
    - Waters et al.: Baroreflex sensitivity and post-flight orthostatic presyncope.
    """
    days = max(1.0, float(mission_days))
    vo2_loss = max(0.0, float(vo2_loss_pct))
    g_target = max(0.1, min(1.0, float(target_gravity)))
    
    # Plasma volume deficit trajectory (rapid adaptation in first 2-3 weeks)
    pv_deficit_frac = P.ORTHO_PLASMA_LOSS_MAX * (1.0 - np.exp(-days / P.ORTHO_TAU_DAYS))
    pv_deficit_pct = pv_deficit_frac * 100.0
    
    # Baroreflex sensitivity attenuation (ms/mmHg): drops from baseline 15 to ~8
    brs_baseline = 15.0
    brs_current = brs_baseline - 7.0 * (1.0 - np.exp(-days / 21.0))
    
    # Postural challenge on 10-minute active stand test under g_target
    g_factor = (g_target / 1.0) ** 0.65
    stand_sbp_drop = (14.0 + 0.35 * vo2_loss + 0.5 * pv_deficit_pct) * g_factor
    stand_hr_rise = (20.0 + 0.40 * vo2_loss + 0.6 * pv_deficit_pct) * g_factor
    
    # Baseline presyncope probability without countermeasures
    p_unmitigated = P.ORTHO_BASE_PRESYNCOPE_PROB * g_factor * (1.0 + vo2_loss / 30.0)
    p_unmitigated = min(0.95, max(0.05, p_unmitigated))
    
    # Countermeasures efficacy
    if fluid_loading and compression_garment:
        mitigation = 1.0 - P.ORTHO_COMBINED_REDUCTION  # 85% reduction
    elif fluid_loading:
        mitigation = 1.0 - P.ORTHO_FLUID_SALT_REDUCTION # 55% reduction
    elif compression_garment:
        mitigation = 1.0 - P.ORTHO_GARMENT_REDUCTION    # 65% reduction
    else:
        mitigation = 1.0
        
    p_final = min(0.95, max(0.02, p_unmitigated * mitigation))
    
    if p_final >= 0.35:
        ortho_status = "HIGH"
        risk_label = "Severe orthostatic intolerance / presyncope likely upon standing"
    elif p_final >= 0.15:
        ortho_status = "MODERATE"
        risk_label = "Moderate postural dizziness, compensatory tachycardia"
    else:
        ortho_status = "LOW"
        risk_label = "Adequate hemodynamics, low presyncope risk"
        
    return {
        "mission_days": round(days, 1),
        "target_gravity_g": round(g_target, 2),
        "plasma_volume_loss_pct": round(pv_deficit_pct, 1),
        "baroreflex_sensitivity_ms_mmhg": round(brs_current, 1),
        "stand_sbp_drop_mmhg": round(stand_sbp_drop, 1),
        "stand_hr_rise_bpm": round(stand_hr_rise, 1),
        "presyncope_probability_unmitigated": round(float(p_unmitigated), 3),
        "presyncope_probability_mitigated": round(float(p_final), 3),
        "fluid_loading_active": fluid_loading,
        "compression_garment_active": compression_garment,
        "status": ortho_status,
        "clinical_assessment": risk_label
    }


# ===========================================================================
# 4. Clinical Interventions & Countermeasure Simulation
# ===========================================================================

def simulate_clinical_interventions(
    bone_loss: float,
    mission_days: int,
    vo2_loss_pct: float = 12.0,
    urine_vol_l: float = 1.6,
    k_citrate_meq: float = 30.0,
    lbnp_hours_day: float = 2.0,
    fluid_loading: bool = True,
    compression_garment: bool = True
) -> dict:
    """Runs a paired before-and-after simulation of clinical countermeasures.
    
    Evaluates:
    - Nephrolithiasis: Baseline vs Potassium Citrate + 2.5L Hydration
    - SANS: Baseline vs 2h Daily Lower Body Negative Pressure (LBNP)
    - Orthostatic Intolerance: Baseline vs Pre-landing Fluid Load + Antigravity Garment
    """
    # 1. Kidney stone baseline vs intervention
    stone_base = urinary_supersaturation(bone_loss, urine_volume_l=urine_vol_l, potassium_citrate_meq=0.0)
    stone_mitigated = urinary_supersaturation(bone_loss, urine_volume_l=max(2.5, urine_vol_l), potassium_citrate_meq=k_citrate_meq)
    
    # 2. SANS baseline vs intervention
    sans_base = sans_advanced_evaluation(mission_days, gravity=0.0, lbnp_hours_day=0.0)
    sans_mitigated = sans_advanced_evaluation(mission_days, gravity=0.0, lbnp_hours_day=lbnp_hours_day)
    
    # 3. Orthostatic intolerance baseline vs intervention
    ortho_base = cardiovascular_orthostatic_risk(mission_days, vo2_loss_pct=vo2_loss_pct, fluid_loading=False, compression_garment=False)
    ortho_mitigated = cardiovascular_orthostatic_risk(mission_days, vo2_loss_pct=vo2_loss_pct, fluid_loading=fluid_loading, compression_garment=compression_garment)
    
    return {
        "mission_days": mission_days,
        "nephrolithiasis": {
            "baseline": stone_base,
            "mitigated": stone_mitigated,
            "supersaturation_reduction_pct": round(
                ((stone_base["ca_oxalate_supersaturation"] - stone_mitigated["ca_oxalate_supersaturation"])
                 / stone_base["ca_oxalate_supersaturation"]) * 100, 1
            )
        },
        "sans": {
            "baseline": sans_base,
            "mitigated": sans_mitigated,
            "onsd_reduction_mm": round(sans_base["onsd_mm"] - sans_mitigated["onsd_mm"], 2),
            "icp_reduction_mmhg": round(sans_base["intracranial_pressure_est_mmhg"] - sans_mitigated["intracranial_pressure_est_mmhg"], 1)
        },
        "orthostatic_intolerance": {
            "baseline": ortho_base,
            "mitigated": ortho_mitigated,
            "presyncope_risk_reduction_pct": round(
                ((ortho_base["presyncope_probability_unmitigated"] - ortho_mitigated["presyncope_probability_mitigated"])
                 / ortho_base["presyncope_probability_unmitigated"]) * 100, 1
            )
        }
    }


# ===========================================================================
# 5. Backward-Compatible Clinical Summary
# ===========================================================================

def clinical_summary(bone_loss_final, mission_days: int, gravity: float = 1.0) -> dict:
    """Clinical risk assessment summary for arrival or check-up day.
    
    Enriched with supersaturation, SANS intracranial dynamics, and orthostatic intolerance
    while preserving backward compatibility with existing tests and UI.
    """
    med_bone_loss = float(np.median(bone_loss_final))
    ca_mg = float(urinary_calcium_excretion(med_bone_loss))
    stone_rr = float(kidney_stone_relative_risk(med_bone_loss))
    
    # Cumulative risk estimate for the elapsed mission
    cum_stone_p = float(1.0 - np.exp(-stone_rr * P.STONE_BASELINE_INCIDENCE * mission_days))
    stone_status = "HIGH" if stone_rr >= P.STONE_RISK_HIGH_THRESH else ("MODERATE" if stone_rr >= 1.5 else "LOW")
    
    # Detailed supersaturation
    ss_details = urinary_supersaturation(med_bone_loss)
    
    # SANS assessment
    sans_data = sans_advanced_evaluation(mission_days, gravity=gravity)
    
    # Orthostatic intolerance assessment
    ortho_data = cardiovascular_orthostatic_risk(mission_days, vo2_loss_pct=10.0, target_gravity=gravity if gravity < 1.0 else P.GRAVITY_MARS)
    
    return {
        "kidney_stone": {
            "urinary_calcium_mg_day": round(ca_mg, 1),
            "baseline_calcium_mg_day": P.CA_EXCRETION_BASE_MG,
            "calcium_elevation_pct": round(((ca_mg / P.CA_EXCRETION_BASE_MG) - 1.0) * 100, 1),
            "relative_risk": round(stone_rr, 2),
            "cumulative_probability": round(cum_stone_p, 4),
            "ca_oxalate_supersaturation": ss_details["ca_oxalate_supersaturation"],
            "brushite_supersaturation": ss_details["brushite_supersaturation"],
            "supersaturation_status": ss_details["supersaturation_status"],
            "status": stone_status,
        },
        "sans": {
            "onsd_mm": sans_data["onsd_mm"],
            "baseline_onsd_mm": P.ONSD_BASELINE_MM,
            "sheath_expansion_mm": sans_data["sheath_expansion_mm"],
            "frisen_grade": sans_data["frisen_grade"],
            "intracranial_pressure_est_mmhg": sans_data["intracranial_pressure_est_mmhg"],
            "hyperopic_shift_diopters": sans_data["hyperopic_shift_diopters"],
            "choroidal_folds_probability": sans_data["choroidal_folds_probability"],
            "severity": sans_data["frisen_grade"],
            "status": sans_data["status"],
        },
        "orthostatic_intolerance": {
            "target_gravity_g": ortho_data["target_gravity_g"],
            "plasma_volume_loss_pct": ortho_data["plasma_volume_loss_pct"],
            "stand_sbp_drop_mmhg": ortho_data["stand_sbp_drop_mmhg"],
            "stand_hr_rise_bpm": ortho_data["stand_hr_rise_bpm"],
            "presyncope_probability_unmitigated": ortho_data["presyncope_probability_unmitigated"],
            "presyncope_probability_mitigated": ortho_data["presyncope_probability_mitigated"],
            "status": ortho_data["status"],
        }
    }
