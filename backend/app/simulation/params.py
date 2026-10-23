"""Every model rate, limit and assumption in one place, each with its source.

Rates are fractions (0.0125 = 1.25%). "Measured" values come from published
spaceflight studies; "assumption" values are ours and are tunable in the app.
"""
import math

MISSION_DAYS = 270

# ---------------------------------------------------------------------------
# Bone — hip areal BMD
# ---------------------------------------------------------------------------
# LeBlanc et al. 2000 (PubMed): hip 1.4–1.5 %/month, spine 0.9 %/month on
# 4–6 month missions *with* ISS exercise → treated as the full-compliance rate.
R_BONE_HIP_POP_MEAN = 0.0125  # per month, middle of the published 1.0–1.5 % range
R_BONE_HIP_POP_SIGMA = 0.15  # log-normal sigma → 5th–95th pct ≈ 1.0–1.6 %/month
R_BONE_SPINE = 0.009  # per month (LeBlanc et al.)
K_BONE = 0.5  # ASSUMPTION: extra loss multiplier at zero resistance compliance
GRAVITY_TRANSIT = 1.0  # microgravity

# ---------------------------------------------------------------------------
# Muscle — leg lean muscle volume
# ---------------------------------------------------------------------------
R_MUSCLE_EX = 0.00075  # per day: −13 % calf volume in 180 d with exercise (Trappe et al. 2009)
R_MUSCLE_NONE = 0.0025  # per day, ASSUMPTION fitted to bed rest (18–30 % in 90–120 d) and ESA "up to 50 %"
SLEEP_THRESHOLD_H = 6.0
SLEEP_PENALTY = 1.2  # ASSUMPTION: r_ex × 1.2 on nights below 6 h
MUSCLE_SENSITIVITY = {"low": 0.85, "normal": 1.0, "high": 1.2}  # ASSUMPTION

# ---------------------------------------------------------------------------
# Cardio — VO2peak
# ---------------------------------------------------------------------------
V_FLOOR_FRAC = 0.60  # ASSUMPTION: VO2peak never drops below 60 % of baseline
CARDIO_EX_EFFECT = 0.7  # full cardio compliance removes 70 % of the decline
CARDIO_TARGET_LOSS_180D = 0.12  # ISS observation: −10 to −15 % (NTRS)


def calibrate_lambda(target_loss: float = CARDIO_TARGET_LOSS_180D, days: int = 180) -> float:
    """λ such that full cardio compliance gives `target_loss` after `days`."""
    remaining = 1 - target_loss / (1 - V_FLOOR_FRAC)
    return -math.log(remaining) / ((1 - CARDIO_EX_EFFECT) * days)


LAMBDA_CARDIO = calibrate_lambda()  # ≈ 0.00661 / day

# ---------------------------------------------------------------------------
# Radiation
# ---------------------------------------------------------------------------
GCR_SCENARIOS = {
    # NASA OCHMO design goals (behind shielding)
    "design_goal": {"label": "NASA design goal", "transit": 1.3, "surface": 0.8},
    # Curiosity MSL/RAD: Zeitlin et al. 2013 (cruise), Hassler et al. 2014 (surface)
    "measured": {"label": "Measured (MSL/RAD)", "transit": 1.84, "surface": 0.64},
}
DEFAULT_GCR_SCENARIO = "design_goal"
SHELTER_FACTOR = 0.2  # ASSUMPTION: storm shelter passes 20 % of SPE dose
CAREER_LIMIT_MSV = 600.0  # NASA-STD-3001 career effective dose limit
SHORT_TERM_LIMIT = 250.0  # 30-day BFO limit (mGy-Eq), used as a per-event warning line

# NOAA S-scale thresholds on peak >10 MeV proton flux (pfu) and our dose map.
# Dose = unsheltered dose inside the spacecraft hull at 1 AU — ASSUMPTION.
S_SCALE = [
    {"scale": "S1", "pfu": 10, "dose_msv": 0.5},
    {"scale": "S2", "pfu": 100, "dose_msv": 2.0},
    {"scale": "S3", "pfu": 1_000, "dose_msv": 10.0},
    {"scale": "S4", "pfu": 10_000, "dose_msv": 50.0},
    {"scale": "S5", "pfu": 100_000, "dose_msv": 200.0},
]
SHELTER_POLICY_MIN_SCALE = 2  # crew shelters for S2 and above unless a scenario says otherwise

# Conjunction-class reference mission for the end-of-mission budget line
SURFACE_STAY_DAYS = 500
RETURN_DAYS = 270
TOTAL_CONJUNCTION_DAYS = MISSION_DAYS + SURFACE_STAY_DAYS + RETURN_DAYS  # 1040 days

# ---------------------------------------------------------------------------
# Gravity environments
# ---------------------------------------------------------------------------
GRAVITY_MARS = 0.38  # Martian surface gravity relative to Earth (g)
GRAVITY_EARTH = 1.0  # Terrestrial 1g reference
# Effective skeletal/muscular unloading factor on Mars: partial loading (0.38g)
# provides ground reaction force and tonic stimulation, reducing microgravity loss by ~38%
GRAVITY_UNLOADING_MARS = 1.0 - GRAVITY_MARS  # 0.62
SURFACE_SPE_SHIELDING = 0.15  # Planetary body shadow (50%) + atmospheric CO2 column (~20 g/cm²)

# ---------------------------------------------------------------------------
# Neuromuscular Strength sub-model
# ---------------------------------------------------------------------------
# Spaceflight studies (Trappe et al. 2009, NASA NTRS): Strength (Maximal Voluntary Contraction)
# declines faster than muscle cross-sectional area due to neural drive deterioration
# and preferential fast-twitch (Type IIx/IIa) myofibrillar loss (~18–22% in 6 months with exercise).
R_STRENGTH_NEURAL = 0.00045  # per day neural adaptation decline in microgravity
STRENGTH_EX_EFFECT = 0.85    # resistance training preserves ~85% of motor unit recruitment
LOSS_LIMIT_STRENGTH = 0.50   # 50% loss threshold

# ---------------------------------------------------------------------------
# Sleep Architecture & Recovery sub-model
# ---------------------------------------------------------------------------
SLEEP_OPTIMAL_H = 8.0        # Target daily sleep for full neuroendocrine/muscular recovery
SLEEP_DEBT_DECAY = 0.15      # Fractional sleep debt clearance per day
SLEEP_DEBT_MAX = 24.0        # Saturation cap on cumulative sleep debt (hours)
SLEEP_DEBT_IMPAIRMENT_THRESH = 8.0  # Hours of cumulative debt triggering chronic impairment

# ---------------------------------------------------------------------------
# Clinical Risk: Kidney Stone Formation (Nephrolithiasis)
# ---------------------------------------------------------------------------
# Bone demineralization causes acute hypercalciuria (calcium released into bloodstream
# excreted in urine). Combined with chronic spaceflight sub-hydration, supersaturation
# of calcium oxalate and brushite creates elevated renal calculi risk (Whitson et al., Curhan et al.).
CA_EXCRETION_BASE_MG = 180.0       # Normal 24h baseline urinary calcium excretion (mg/day)
CA_EXCRETION_BONE_FACTOR = 160.0   # Additional urinary calcium excretion per unit bone loss rate
STONE_BASELINE_INCIDENCE = 0.00012 # Terrestrial baseline daily stone incidence rate
STONE_RISK_HIGH_THRESH = 3.0       # Relative risk threshold for high alert

# ---------------------------------------------------------------------------
# Clinical Risk: SANS (Spaceflight-Associated Neuro-ocular Syndrome)
# ---------------------------------------------------------------------------
# Microgravity cephalad fluid shift removes the hydrostatic downward gradient, causing
# persistent internal jugular and cerebral venous engorgement, optic disc edema, and optic
# nerve sheath enlargement (Mader et al. 2011, Stenger et al. 2017).
ONSD_BASELINE_MM = 5.1      # Normal terrestrial optic nerve sheath diameter (mm)
ONSD_MAX_DELTA_MM = 1.1     # Maximum sheath enlargement in microgravity (mm)
SANS_TAU_DAYS = 45.0        # Time constant of optic nerve sheath remodeling (days)
SANS_GRADE1_THRESH_MM = 5.8 # ONSD threshold for Frisen Grade 1 papilledema risk
SANS_GRADE2_THRESH_MM = 6.0 # ONSD threshold for Frisen Grade 2+ papilledema risk

# ---------------------------------------------------------------------------
# Readiness score
# ---------------------------------------------------------------------------
LOSS_LIMITS = {"bone": 0.20, "muscle": 0.50, "cardio": 0.40, "strength": LOSS_LIMIT_STRENGTH}
WEIGHTS = {"bone": 0.35, "muscle": 0.35, "cardio": 0.30}  # Core 3-way baseline weights (backward-compatible)
WEIGHTS_EXPANDED = {"bone": 0.25, "muscle": 0.25, "cardio": 0.25, "strength": 0.25}  # 4-way holistic
GREEN_MIN = 70.0
AMBER_MIN = 50.0
SUBSCORE_CAP = 0.4  # any sub-score below this caps the status at AMBER

# ---------------------------------------------------------------------------
# Exercise prescription and Monte Carlo
# ---------------------------------------------------------------------------
PRESCRIBED_RESISTANCE_MIN = 60  # per session, 7 sessions / week = full plan
PRESCRIBED_CARDIO_MIN = 60  # per day
MC_RUNS = 500
OPTIMIZER_RUNS = 200
RATE_SIGMA_PERSONAL = 0.12  # log-normal spread around a crew member's pre-flight bone estimate
RATE_SIGMA_OTHER = 0.15  # "each other rate ±15 %"

# Check-up measurement noise (1 SD) used by the Bayesian twin updater
NOISE_BONE = 0.015  # DXA precision ≈ 1–2 %
NOISE_MUSCLE = 0.03  # ASSUMPTION: MRI / ultrasound volume precision
NOISE_VO2 = 0.04  # ASSUMPTION: cycle-ergometer VO2peak test repeatability
NOISE_STRENGTH = 0.05  # Isometric dynamometry precision ≈ 5%


def registry() -> list[dict]:
    """Parameter table served by /api/model, mirroring the README and expanded models."""
    return [
        {"key": "r_bone_hip", "label": "Hip bone loss (full exercise)", "value": "1.0–1.5", "unit": "% / month",
         "type": "Measured", "source": "LeBlanc et al. 2000"},
        {"key": "r_bone_spine", "label": "Spine bone loss", "value": round(R_BONE_SPINE * 100, 2), "unit": "% / month",
         "type": "Measured", "source": "LeBlanc et al. 2000"},
        {"key": "k_bone", "label": "Extra bone loss with no exercise (k_bone)", "value": K_BONE, "unit": "×",
         "type": "Assumption", "source": "ARES Twin"},
        {"key": "r_ex", "label": "Muscle loss, full exercise", "value": round(R_MUSCLE_EX * 100, 3), "unit": "% / day",
         "type": "Measured", "source": "Trappe et al. 2009 (−13 % calf in 6 months)"},
        {"key": "r_none", "label": "Muscle loss, no exercise", "value": round(R_MUSCLE_NONE * 100, 3), "unit": "% / day",
         "type": "Assumption", "source": "Fitted to bed rest + ESA (up to −50 %)"},
        {"key": "sleep_penalty", "label": "Muscle loss multiplier when sleep < 6 h", "value": SLEEP_PENALTY,
         "unit": "×", "type": "Assumption", "source": "ARES Twin"},
        {"key": "v_floor", "label": "VO2peak floor", "value": round(V_FLOOR_FRAC * 100), "unit": "% of baseline",
         "type": "Assumption", "source": "ARES Twin"},
        {"key": "lambda", "label": "Cardio decay rate λ", "value": round(LAMBDA_CARDIO, 5), "unit": "/ day",
         "type": "Calibrated", "source": "−12 % in 6 months (NTRS: −10 to −15 %)"},
        {"key": "gcr_design", "label": "GCR dose, transit / surface (design goal)", "value": "1.3 / 0.8",
         "unit": "mSv / day", "type": "NASA design goal", "source": "NASA OCHMO"},
        {"key": "gcr_measured", "label": "GCR dose, cruise / surface (measured)", "value": "1.84 / 0.64",
         "unit": "mSv / day", "type": "Measured", "source": "Zeitlin 2013; Hassler 2014 (MSL/RAD)"},
        {"key": "s_shelter", "label": "Storm shelter transmission", "value": SHELTER_FACTOR, "unit": "×",
         "type": "Assumption", "source": "ARES Twin"},
        {"key": "career_limit", "label": "Career effective dose limit", "value": CAREER_LIMIT_MSV, "unit": "mSv",
         "type": "NASA standard", "source": "NASA-STD-3001 / OCHMO"},
        {"key": "short_term_limit", "label": "Short-term (30-day BFO) limit", "value": SHORT_TERM_LIMIT,
         "unit": "mGy-Eq", "type": "NASA standard", "source": "NASA-STD-3001 (verify current revision)"},
        {"key": "spe_dose_map", "label": "S-scale → SPE dose map", "value": "S1 0.5 … S5 200", "unit": "mSv",
         "type": "Assumption", "source": "ARES Twin (log-log interpolation on peak pfu)"},
        {"key": "gravity_mars", "label": "Mars surface gravity", "value": GRAVITY_MARS, "unit": "g",
         "type": "Physical constant", "source": "NASA Mars Fact Sheet"},
        {"key": "gravity_unloading_mars", "label": "Mars partial skeletal/muscular unloading factor",
         "value": GRAVITY_UNLOADING_MARS, "unit": "fraction", "type": "Biomechanical model",
         "source": "1 - g_mars (reduced deconditioning under 0.38g partial weight-bearing)"},
        {"key": "r_strength_neural", "label": "Neuromuscular activation decline rate",
         "value": round(R_STRENGTH_NEURAL * 100, 4), "unit": "% / day", "type": "Measured/Calibrated",
         "source": "Trappe et al. 2009; NASA NTRS (rapid neural motor unit loss)"},
        {"key": "sleep_optimal_h", "label": "Optimal sleep duration for recovery", "value": SLEEP_OPTIMAL_H,
         "unit": "h / day", "type": "NASA standard", "source": "NASA-STD-3001 Behavioural Health"},
        {"key": "ca_excretion_base", "label": "Baseline 24h urinary calcium excretion", "value": CA_EXCRETION_BASE_MG,
         "unit": "mg / day", "type": "Clinical reference", "source": "Whitson et al., NASA Johnson Space Center"},
        {"key": "onsd_baseline", "label": "Baseline Optic Nerve Sheath Diameter (SANS)", "value": ONSD_BASELINE_MM,
         "unit": "mm", "type": "Clinical reference", "source": "Mader et al. 2011; Stenger et al. 2017"},
        {"key": "conjunction_mission_days", "label": "Full Conjunction-Class Mission Days",
         "value": TOTAL_CONJUNCTION_DAYS, "unit": "days", "type": "Mission Architecture",
         "source": "NASA DRA 5.0 (270d outbound + 500d surface + 270d return)"},
    ]
