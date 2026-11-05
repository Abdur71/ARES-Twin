"""High-Precision 3D Planetary Ephemeris for Earth and Mars.

Formulation: NASA JPL Standish Planetary Orbital Elements (J2000 epoch with secular rates).
Eliminates 2D coplanar and circular simplifications by accounting for Mars's 1.85° inclination
and 0.0934 orbital eccentricity.
"""
from datetime import date, datetime
import math
import numpy as np

# Astronomical constants
AU_KM = 149597870.7                # Kilometers per AU
AU_LIGHT_MIN = 8.316746397         # Light-minutes per AU
KM_S_PER_AU_DAY = AU_KM / 86400.0  # 1731.4568 km/s per AU/day
MU_SUN_AU_DAY = 0.0002959122082855911  # Sun gravitational parameter in AU^3 / day^2
MU_SUN_KM = 1.32712440018e11       # km^3 / s^2
J2000_JD = 2451545.0               # Julian Date for J2000.0 (2000-01-01 12:00 UTC)


def date_to_jd(d: date | datetime) -> float:
    """Convert Python date/datetime to Julian Date."""
    year = d.year
    month = d.month
    day = d.day
    if isinstance(d, datetime):
        day += (d.hour + d.minute / 60.0 + d.second / 3600.0) / 24.0

    if month <= 2:
        year -= 1
        month += 12

    a = math.floor(year / 100)
    b = 2 - a + math.floor(a / 4)
    jd = math.floor(365.25 * (year + 4716)) + math.floor(30.6001 * (month + 1)) + day + b - 1524.5
    return float(jd)


# Standish JPL Mean Orbital Elements at J2000 and Rates per Julian Century (cy)
# Format: {param: (val_at_j2000, rate_per_cy)}
# a (AU), e (dimensionless), i (deg), L (deg, mean longitude), varpi (deg, perihelion), Omega (deg, asc node)
ELEMENTS_JPL = {
    "earth": {
        "a": (1.00000261, 0.00000562),
        "e": (0.01671123, -0.00004392),
        "i": (0.00001531, -0.01294668),
        "L": (100.46457166, 35999.37244981),
        "varpi": (102.93768193, 0.32327364),
        "omega": (0.0, 0.0),
    },
    "mars": {
        "a": (1.52371034, 0.00001847),
        "e": (0.09339410, 0.00007882),
        "i": (1.84969142, -0.00813131),
        "L": (-4.55343205, 19140.30268499),
        "varpi": (-23.94362959, 0.44441088),
        "omega": (49.55953891, -0.29257343),
    }
}


def _solve_kepler(m_rad: float, e: float) -> float:
    """Solve Kepler's equation M = E - e*sin(E) for eccentric anomaly E using Newton iteration."""
    # Normalize M to [-pi, pi]
    m = m_rad % (2.0 * math.pi)
    e_anom = m if e < 0.8 else math.pi
    for _ in range(30):
        f = e_anom - e * math.sin(e_anom) - m
        f_prime = 1.0 - e * math.cos(e_anom)
        delta = f / f_prime
        e_anom -= delta
        if abs(delta) < 1e-12:
            break
    return e_anom


def planet_state(planet_name: str, target_date: date | datetime) -> tuple[np.ndarray, np.ndarray]:
    """Computes exact 3D position (AU) and velocity (AU/day) in Heliocentric Ecliptic J2000 frame.
    
    Returns:
        r: np.ndarray shape (3,) in AU
        v: np.ndarray shape (3,) in AU/day
    """
    key = planet_name.lower()
    if key not in ELEMENTS_JPL:
        raise ValueError(f"Unknown planet '{planet_name}'. Supported: 'earth', 'mars'")

    jd = date_to_jd(target_date)
    t_cy = (jd - J2000_JD) / 36525.0  # Julian centuries since J2000.0

    p = ELEMENTS_JPL[key]
    a = p["a"][0] + p["a"][1] * t_cy
    e = p["e"][0] + p["e"][1] * t_cy
    i_deg = p["i"][0] + p["i"][1] * t_cy
    l_deg = p["L"][0] + p["L"][1] * t_cy
    varpi_deg = p["varpi"][0] + p["varpi"][1] * t_cy
    node_deg = p["omega"][0] + p["omega"][1] * t_cy

    # Derived Keplerian angles in radians
    i = math.radians(i_deg)
    node = math.radians(node_deg)
    varpi = math.radians(varpi_deg)
    arg_peri = (varpi - node) % (2.0 * math.pi)

    # Mean anomaly M = L - varpi
    m = math.radians(l_deg - varpi_deg) % (2.0 * math.pi)

    # Solve Kepler's equation for eccentric anomaly E
    ecc_anom = _solve_kepler(m, e)

    # True anomaly nu
    sin_nu = (math.sqrt(1.0 - e**2) * math.sin(ecc_anom)) / (1.0 - e * math.cos(ecc_anom))
    cos_nu = (math.cos(ecc_anom) - e) / (1.0 - e * math.cos(ecc_anom))
    nu = math.atan2(sin_nu, cos_nu)

    # Heliocentric orbital radius r
    r_mag = a * (1.0 - e**2) / (1.0 + e * math.cos(nu))

    # Coordinates in orbital plane
    x_orb = r_mag * math.cos(nu)
    y_orb = r_mag * math.sin(nu)

    # Orbital velocity in orbital plane: v = sqrt(mu / (a * (1-e^2))) * [-sin(nu), e + cos(nu)]
    p_semi = a * (1.0 - e**2)
    h_const = math.sqrt(MU_SUN_AU_DAY * p_semi)
    vx_orb = -MU_SUN_AU_DAY / h_const * math.sin(nu)
    vy_orb = MU_SUN_AU_DAY / h_const * (e + math.cos(nu))

    # Rotation matrix from orbital plane to ecliptic frame:
    # R = R_z(-node) * R_x(-i) * R_z(-arg_peri)
    cos_n, sin_n = math.cos(node), math.sin(node)
    cos_i, sin_i = math.cos(i), math.sin(i)
    cos_w, sin_w = math.cos(arg_peri), math.sin(arg_peri)

    # Direction cosine elements
    p_x = cos_n * cos_w - sin_n * sin_w * cos_i
    p_y = sin_n * cos_w + cos_n * sin_w * cos_i
    p_z = sin_w * sin_i

    q_x = -cos_n * sin_w - sin_n * cos_w * cos_i
    q_y = -sin_n * sin_w + cos_n * cos_w * cos_i
    q_z = cos_w * sin_i

    # 3D Position vector in AU
    r_vec = np.array([
        x_orb * p_x + y_orb * q_x,
        x_orb * p_y + y_orb * q_y,
        x_orb * p_z + y_orb * q_z
    ], dtype=float)

    # 3D Velocity vector in AU/day
    v_vec = np.array([
        vx_orb * p_x + vy_orb * q_x,
        vx_orb * p_y + vy_orb * q_y,
        vx_orb * p_z + vy_orb * q_z
    ], dtype=float)

    return r_vec, v_vec


def solar_conjunction_and_comm(spacecraft_pos_au: np.ndarray, earth_pos_au: np.ndarray) -> dict:
    """Calculates communication latency and solar conjunction blackout warning.
    
    When the spacecraft passes behind the Sun from Earth's perspective (elongation < 2.5°),
    solar plasma scintillation disrupts radio telemetry completely for 10-14 days.
    """
    sc = np.asarray(spacecraft_pos_au, dtype=float)
    earth = np.asarray(earth_pos_au, dtype=float)

    # Vector from Earth to spacecraft
    d_vec = sc - earth
    d_au = float(np.linalg.norm(d_vec))
    comm_delay_min = d_au * AU_LIGHT_MIN

    # Sun-Earth-Spacecraft angle (solar elongation from Earth)
    # Sun is at [0, 0, 0]. Vector Earth->Sun is -earth
    r_sun = -earth
    norm_sun = np.linalg.norm(r_sun)
    norm_craft = np.linalg.norm(d_vec)

    cos_theta = np.dot(r_sun, d_vec) / (norm_sun * norm_craft)
    cos_theta = max(-1.0, min(1.0, float(cos_theta)))
    elongation_deg = math.degrees(math.acos(cos_theta))

    # Radio communication blackout occurs when elongation < 2.5 degrees and spacecraft is farther than Sun
    is_behind_sun = bool(np.linalg.norm(sc) > np.linalg.norm(earth))
    blackout_active = bool((elongation_deg < 2.5) and is_behind_sun)

    return {
        "earth_distance_au": round(d_au, 4),
        "earth_distance_km": round(d_au * AU_KM, 0),
        "one_way_comm_delay_min": round(comm_delay_min, 2),
        "solar_elongation_deg": round(elongation_deg, 2),
        "solar_conjunction_blackout": blackout_active,
        "comm_status": "BLACKOUT" if blackout_active else ("DEGRADED" if elongation_deg < 5.0 else "NOMINAL")
    }
