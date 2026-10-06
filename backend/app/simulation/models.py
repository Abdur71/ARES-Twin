"""Daily update equations for the four sub-models.

All state is *relative to baseline* (1.0 = pre-flight). Every argument may be a
scalar or a NumPy array of shape (runs,), so one call advances every Monte
Carlo run at once.
"""
import numpy as np

from app.simulation import params as P


def compliance(done_min, prescribed_min):
    """c_t = min(1, done / prescribed)."""
    return np.minimum(1.0, np.asarray(done_min, dtype=float) / prescribed_min)


def bone_step(bmd, r_bone_month, c_res, gravity=None, k_bone=None):
    """BMD_{t+1} = BMD_t (1 − r/30 · [1 + k(1 − c)] · g). Defaults are read from params at call time."""
    gravity = P.GRAVITY_TRANSIT if gravity is None else gravity
    k_bone = P.K_BONE if k_bone is None else k_bone
    return bmd * (1 - (r_bone_month / 30.0) * (1 + k_bone * (1 - c_res)) * gravity)


def sleep_factor(sleep_h):
    return np.where(np.asarray(sleep_h) < P.SLEEP_THRESHOLD_H, P.SLEEP_PENALTY, 1.0)


def muscle_daily_loss(c_res, sleep_h, mult=1.0):
    """Fractional muscle loss for one day, before the personal multiplier is applied."""
    return mult * (c_res * P.R_MUSCLE_EX * sleep_factor(sleep_h) + (1 - c_res) * P.R_MUSCLE_NONE)


def muscle_step(muscle, c_res, sleep_h, mult=1.0):
    """M_{t+1} = M_t (1 − [c · r_ex · σ + (1 − c) · r_none]) × personal sensitivity."""
    return muscle * (1 - muscle_daily_loss(c_res, sleep_h, mult))


def cardio_step(vo2, c_cardio, mult=1.0, lam=None, floor=None):
    """V_{t+1} = V_t − λ (1 − 0.7 c) (V_t − V_floor)."""
    lam = P.LAMBDA_CARDIO if lam is None else lam
    floor = P.V_FLOOR_FRAC if floor is None else floor
    return vo2 - lam * mult * (1 - P.CARDIO_EX_EFFECT * c_cardio) * (vo2 - floor)


def radiation_step(dose, gcr_msv, spe_msv=0.0, sheltered=False):
    """D_{t+1} = D_t + d_GCR + E_SPE · s_shelter (SPE already scaled for distance)."""
    shelter = np.where(sheltered, P.SHELTER_FACTOR, 1.0)
    return dose + gcr_msv + spe_msv * shelter


def spe_dose_from_pfu(peak_pfu: float) -> float:
    """Unsheltered dose at 1 AU for a given peak >10 MeV flux (log-log interpolation of the S-scale map)."""
    if peak_pfu is None or peak_pfu < P.S_SCALE[0]["pfu"]:
        return 0.0
    xs = np.log10([s["pfu"] for s in P.S_SCALE])
    ys = np.log10([s["dose_msv"] for s in P.S_SCALE])
    x = np.log10(peak_pfu)
    if x >= xs[-1]:  # extrapolate the last segment for >S5 events
        slope = (ys[-1] - ys[-2]) / (xs[-1] - xs[-2])
        return float(10 ** (ys[-1] + slope * (x - xs[-1])))
    return float(10 ** np.interp(x, xs, ys))


def s_scale(peak_pfu: float) -> int:
    """NOAA S-scale level (0 = below S1)."""
    level = 0
    for i, s in enumerate(P.S_SCALE, start=1):
        if peak_pfu is not None and peak_pfu >= s["pfu"]:
            level = i
    return level
