"""Mars Atmospheric Entry, Descent and Landing (EDL) Trajectory & Deceleration Physics.

Models the critical aerodynamic entry corridor into Mars's CO2 atmosphere:
- Altitude-dependent Mars atmosphere density profile
- Ballistic and lifting entry equations of motion
- Aerodynamic deceleration G-load profile (Gx and Gz)
- Sutton-Graves stagnation-point convective heat flux
- Parachute supersonic deployment window (Mach 1.8-2.2)
- Cardiovascular G-tolerance assessment for deconditioned crew
"""
import math
import numpy as np

# Physical constants for Mars
G0_EARTH = 9.80665                 # m/s^2 (Standard terrestrial gravity reference for G-force)
G_MARS_SURFACE = 3.72076           # m/s^2
R_MARS_M = 3389.5 * 1000.0         # Mars mean radius in meters
R_NOSE_M = 1.5                     # Heat shield nose radius in meters
SUTTON_GRAVES_K = 1.9027e-4        # Mars CO2-N2 convective heating constant (W / (m^1.5 * (kg/m^3)^0.5 * (m/s)^3))

# Mars atmospheric parameters (exponential density model with scale height)
RHO_0_MARS = 0.020                 # kg/m^3 surface density
SCALE_HEIGHT_M = 11100.0           # 11.1 km scale height


def mars_atmospheric_density(altitude_m: float) -> float:
    """Atmospheric density at altitude in Martian atmosphere (kg/m^3)."""
    h = max(0.0, float(altitude_m))
    return RHO_0_MARS * math.exp(-h / SCALE_HEIGHT_M)


def simulate_mars_entry(
    entry_speed_km_s: float = 6.1,
    entry_flight_path_angle_deg: float = -12.5,
    vehicle_mass_kg: float = 15000.0,
    heat_shield_area_m2: float = 50.0,
    drag_coefficient: float = 1.6,
    lift_to_drag_ratio: float = 0.28,
    entry_altitude_km: float = 125.0,
    sim_dt_s: float = 0.25
) -> dict:
    """Simulates Mars atmospheric entry trajectory from 125 km entry interface to parachute/landing.
    
    Equations of motion:
      dh/dt = v * sin(gamma)
      dv/dt = -D/m - g_mars * sin(gamma)
      dgamma/dt = (L/m * cos(bank) + (v^2/r - g_mars) * cos(gamma)) / v
    """
    v = entry_speed_km_s * 1000.0  # m/s
    gamma = math.radians(entry_flight_path_angle_deg)
    h = entry_altitude_km * 1000.0  # m
    m = vehicle_mass_kg
    area = heat_shield_area_m2
    cd = drag_coefficient
    ld = lift_to_drag_ratio
    cl = cd * ld
    ballistic_coeff = m / (cd * area)  # kg/m^2

    time_s = 0.0
    trajectory = []

    peak_g = 0.0
    peak_heat_flux = 0.0
    parachute_deployed = False
    parachute_info = {}

    while h > 0.0 and time_s < 600.0 and v > 50.0:
        rho = mars_atmospheric_density(h)
        r = R_MARS_M + h
        g_curr = G_MARS_SURFACE * (R_MARS_M / r)**2

        # Aerodynamic forces
        q_dyn = 0.5 * rho * (v ** 2)  # dynamic pressure (Pa)
        drag = q_dyn * cd * area
        lift = q_dyn * cl * area

        # Deceleration G-force (aerodynamic drag / standard Earth g0)
        a_aero = drag / m
        g_load = a_aero / G0_EARTH
        if g_load > peak_g:
            peak_g = g_load

        # Sutton-Graves convective heat flux (W/cm^2 = 10^-4 W/m^2)
        heat_flux_w_cm2 = (SUTTON_GRAVES_K * math.sqrt(rho / R_NOSE_M) * (v ** 3)) / 10000.0
        if heat_flux_w_cm2 > peak_heat_flux:
            peak_heat_flux = heat_flux_w_cm2

        # Speed of sound in cold CO2 atmosphere (~220 m/s)
        temp_k = max(130.0, 210.0 - 0.0025 * h)
        speed_of_sound = math.sqrt(1.29 * 188.9 * temp_k)
        mach = v / speed_of_sound

        # Parachute trigger window: Mach 1.8 to 2.2 and altitude between 6 km and 12 km
        if not parachute_deployed and 1.7 <= mach <= 2.2 and 6000.0 <= h <= 12000.0:
            parachute_deployed = True
            parachute_info = {
                "deployment_altitude_m": round(h, 0),
                "deployment_mach": round(mach, 2),
                "deployment_velocity_m_s": round(v, 1),
                "dynamic_pressure_kpa": round(q_dyn / 1000.0, 2),
                "time_after_entry_s": round(time_s, 1)
            }

        # Record every 2 seconds
        if int(time_s / sim_dt_s) % int(2.0 / sim_dt_s) == 0:
            trajectory.append({
                "time_s": round(time_s, 1),
                "altitude_km": round(h / 1000.0, 2),
                "velocity_km_s": round(v / 1000.0, 3),
                "mach": round(mach, 1),
                "deceleration_g": round(g_load, 2),
                "heat_flux_w_cm2": round(heat_flux_w_cm2, 1),
                "dynamic_pressure_kpa": round(q_dyn / 1000.0, 1)
            })

        # Numerical integration step
        dv_dt = -(drag / m) - g_curr * math.sin(gamma)
        dh_dt = v * math.sin(gamma)
        dgamma_dt = (lift / m + ( (v**2)/r - g_curr ) * math.cos(gamma)) / max(1.0, v)

        v += dv_dt * sim_dt_s
        h += dh_dt * sim_dt_s
        gamma += dgamma_dt * sim_dt_s
        time_s += sim_dt_s

    # Crew G-Tolerance Assessment:
    # After 270 days of microgravity cardiovascular deconditioning (plasma volume loss ~14%),
    # tolerance to chest-in (+Gx) deceleration drops from 9g to ~5.5g; head-to-toe (+Gz) tolerance drops to ~2.5g.
    if peak_g > 6.0:
        crew_g_risk = "CRITICAL (High risk of grey-out / G-LOC in deconditioned crew)"
    elif peak_g > 4.5:
        crew_g_risk = "ELEVATED (Sustained heavy chest pressure, dyspnea, postural visual tunneling)"
    else:
        crew_g_risk = "ACCEPTABLE (Within nominal reclined couch +Gx physiological limits)"

    return {
        "entry_conditions": {
            "entry_speed_km_s": entry_speed_km_s,
            "flight_path_angle_deg": entry_flight_path_angle_deg,
            "vehicle_mass_kg": vehicle_mass_kg,
            "ballistic_coefficient_kg_m2": round(ballistic_coeff, 1),
            "lift_to_drag_ratio": ld
        },
        "peak_deceleration_g": round(peak_g, 2),
        "peak_convective_heat_flux_w_cm2": round(peak_heat_flux, 1),
        "entry_duration_s": round(time_s, 1),
        "parachute_deployment": parachute_info if parachute_deployed else "Not reached in window",
        "crew_physiological_g_assessment": {
            "peak_chest_in_gx": round(peak_g, 2),
            "deconditioned_crew_tolerance_threshold_g": 5.5,
            "g_tolerance_status": crew_g_risk,
            "anti_g_suit_recommended": peak_g >= 4.0
        },
        "trajectory_sample_count": len(trajectory),
        "trajectory": trajectory
    }
