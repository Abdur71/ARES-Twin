# ARES Twin — Astronaut Digital Twin Simulator

> **Simulation and Decision-Support System for Human Mars Missions**

ARES Twin gives every crew member a virtual body that forecasts their bone, muscle, heart fitness and radiation dose on Mars arrival day, and shows what to change today to arrive fit for duty.

> **DISCLAIMER:**
> ARES Twin is a simulation, research, educational, and decision-support prototype. It is **NOT** a certified medical device. All astronaut profiles are simulated/fictitious. Physiological rates come from published studies; space-weather inputs are real NASA/NOAA data; every assumption is labelled and tunable in the app.

---

## The Problem

- Weight-bearing bones lose about **1–1.5% of density per month** on 4–6 month missions.
- Even with exercise, **aerobic capacity, leg muscle size and strength fall ~10–15%** on ISS missions.
- On a **~9-month (270-day) transit** there is no hospital at arrival and up to **22 minutes of one-way communication delay**.

Most monitoring tools show the astronaut's state *today*. ARES Twin answers three different questions:

1. **Forecast** — where will this astronaut be on arrival day if nothing changes?
2. **What-if** — what happens if they skip exercise, sleep less, or a solar storm hits?
3. **Optimize** — what is the smallest exercise plan that keeps them above the safety line?

---

## Architecture Overview

```
ARES-TWIN/
│
├── frontend/             # Next.js (React, JavaScript, Tailwind CSS, Recharts, Lucide)
├── backend/              # FastAPI (Python, NumPy, Pydantic, SQLAlchemy, SQLite)
└── analysis/             # Scientific validation, Jupyter notebooks, experiments, plots
```

### High-Level Data Flow

```
Frontend (Next.js Mission Control UI)
       │  REST API (HTTP/JSON)
       ▼
Backend (FastAPI Engine)
  ├── Health & API Endpoints
  ├── Digital Twin Simulation Engine (bone, muscle, cardio, radiation)
  ├── Readiness Scoring Engine + Radiation Budget
  ├── Monte Carlo Stochastic Simulator (vectorised NumPy)
  ├── Bayesian Twin Updater (personalises rates from check-up measurements)
  ├── Countermeasure Optimizer
  └── Space-Weather Services (DONKI, NOAA protons, JPL Horizons) + JSON cache
       │
       ▼
Storage (JSON files → SQLite / SQLAlchemy)
```

### The Daily Loop

Once per simulated day the engine:

1. **Reads inputs** — each astronaut's resistance minutes, cardio minutes, sleep hours; any solar particle event on this date; spacecraft distance from the Sun.
2. **Updates the four sub-models** — bone, muscle, cardio, radiation.
3. **Projects forward** — assumes current habits continue to arrival and runs the remaining mission 500 times with slightly different rates (Monte Carlo).
4. **Scores and alerts** — converts arrival-day values into a 0–100 readiness score with a status band; raises alerts on threshold crossings.
5. **Answers questions** — the what-if simulator and optimizer re-run steps 2–4 with changed inputs in under a second.

### Planned Backend Layout

```
backend/app/
├── api/               # /health, /crew, /simulate, /whatif, /optimize, /spaceweather
├── config/            # settings (pydantic-settings)
├── simulation/
│   ├── params.py      # every rate and limit, with its source in a comment
│   ├── models.py      # bone / muscle / cardio / radiation update functions (NumPy arrays)
│   ├── simulate.py    # daily loop + vectorised Monte Carlo (state arrays of shape [runs])
│   ├── readiness.py   # sub-scores, composite score, status bands, radiation budget
│   ├── twin_update.py # Bayesian update of personal rates from check-up measurements
│   └── optimize.py    # brute-force plan search (56 plans × 200 runs as one batch)
├── spaceweather/
│   ├── donki.py       # DONKI client, de-duplication, JSON cache
│   ├── protons.py     # NOAA SEP list / GOES flux → S-scale → dose
│   └── horizons.py    # heliocentric distance + light-time comm delay per mission day
├── crew/
│   └── generator.py   # virtual crew + daily logs with injected events
└── data/
    ├── crew.json
    ├── donki_cache/
    └── spe_dose_map.json
```

> The production app does **not** import from `analysis/`; that folder holds notebooks and validation work only.

---

## The Physiological Models

Each sub-model is one short first-order equation updated once per day. Two **compliance** values link exercise to the models — the share of the prescribed plan actually done that day (0 = none, 1 = full plan):

$$c^{res}_t = \min\left(1, \frac{\text{resistance minutes done}_t}{\text{resistance minutes prescribed}}\right), \qquad c^{cardio}_t = \min\left(1, \frac{\text{cardio minutes done}_t}{\text{cardio minutes prescribed}}\right)$$

Resistance compliance drives **bone and muscle**; cardio compliance drives **VO2peak**.

### Bone

Published loss rates were measured *with* ISS exercise, so they are treated as the full-compliance rate and scaled up when exercise is missed:

$$BMD_{t+1} = BMD_t \times \left(1 - \frac{r_{bone}}{30} \times \left[1 + k_{bone}(1 - c^{res}_t)\right] \times g\right)$$

- `r_bone` = 1.0–1.5% / month (hip), 0.9% / month (spine) — drawn per astronaut
- `k_bone` = extra loss factor with no exercise (**assumption**: 0.5, tunable)
- `g` = gravity factor: 1.0 in transit (Mars-surface effect of 0.38 g is unknown → shown as two scenarios in a later phase)

### Muscle

Leg muscle volume moves between two known end points: about −13% over 6 months with full exercise, and up to −50% on long missions with none:

$$M_{t+1} = M_t \times \left(1 - \left[c^{res}_t \cdot r_{ex} \cdot \sigma_t + (1 - c^{res}_t) \cdot r_{none}\right]\right)$$

- `r_ex` ≈ 0.075% / day (13% over 180 days)
- `r_none` ≈ 0.25% / day (**assumption** fitted to bed-rest losses of 18–30% in 90–120 days)
- `σ_t` = sleep penalty: 1.2 when sleep < 6 h, otherwise 1.0 (**assumption**) — so the sleep slider actually moves readiness

### Cardio (VO2peak)

Aerobic fitness drifts toward a floor, faster when cardio is skipped:

$$V_{t+1} = V_t - \lambda\,(1 - 0.7\,c^{cardio}_t)\,(V_t - V_{floor})$$

- `V_floor` = **60%** of baseline (**assumption**; lowered from 70% so the cardio sub-score can actually reach the 40% limit)
- `λ` = 0.00661 / day — calibrated so full compliance gives −12% over 6 months (ISS observed 10–15%)

### Radiation

$$D_{t+1} = D_t + d_{GCR} + E_{SPE,t} \times \left(\frac{1\,\text{AU}}{r_t}\right)^{2} \times s_{shelter}$$

- `d_GCR` (galactic cosmic rays) — two selectable scenarios:
  - **Design goal** (NASA OCHMO): 1.3 mSv/day free space, 0.8 mSv/day surface
  - **Measured** (Curiosity MSL/RAD): ~1.8 mSv/day in cruise (Zeitlin et al. 2013), ~0.64 mSv/day on the Mars surface (Hassler et al. 2014)
- `E_SPE,t` = dose from a solar particle event that day, sized by its NOAA **S-scale** class (see below)
- `r_t` = spacecraft distance from the Sun in AU, from JPL Horizons (1.0 → ~1.5 AU); inverse-square scaling is a stated simplification
- `s_shelter` = 0.2 if the crew reached the storm shelter, else 1.0 (**assumption**)

### Parameter Table

| Parameter | Value | Type | Source |
|---|---|---|---|
| Hip bone loss | 1.0–1.5% / month | Measured | LeBlanc et al.; SpaceDaily summary |
| Spine bone loss | 0.9% / month | Measured | LeBlanc et al. |
| Calf volume loss, full exercise | −13% in 6 months | Measured | Trappe et al., J Appl Physiol 2009 |
| Muscle loss, no exercise | up to −50% (long missions) | Estimate | ESA |
| VO2peak, muscle, strength loss | −10 to −15% | Measured | NASA NTRS |
| GCR dose rate (design goal) | 1.3 / 0.8 mSv per day | NASA design goal | NASA OCHMO |
| GCR dose rate (measured) | ~1.8 cruise / ~0.64 surface mSv per day | Measured | MSL/RAD (Zeitlin 2013, Hassler 2014) |
| Career dose limit | < 600 mSv | NASA standard | NASA OCHMO |
| Short-term SPE limit | 250 mGy-Eq (30-day, blood-forming organs) — *verify against current NASA-STD-3001* | NASA standard | NASA OCHMO |
| `k_bone`, `r_none`, `σ`, `V_floor`, `s_shelter`, SPE dose map | see above | **Our assumption** | Labelled as tunable in the app |

---

## Readiness Score

Radiation is shown separately as a dose budget (long-term cancer risk, not fitness on landing day). The other three systems combine into one 0–100 score. Each sub-score is 1 at zero loss and falls to 0 at a set limit; the loss is squared so small losses cost little and losses near the limit cost a lot:

$$S_i = \max\left(0,\ 1 - \left(\frac{\text{loss}_i}{\text{limit}_i}\right)^2\right)$$

$$\text{Readiness} = 100 \times (0.35\,S_{bone} + 0.35\,S_{muscle} + 0.30\,S_{cardio})$$

| System | Limit where score = 0 | Weight |
|---|---|---|
| Hip bone density | 20% loss | 0.35 |
| Leg muscle volume | 50% loss | 0.35 |
| Aerobic fitness (VO2peak) | 40% loss | 0.30 |

**Status bands:** GREEN ≥ 70 · AMBER 50–69 · RED < 50. If any single sub-score is below 0.4, overall status is capped at AMBER. Limits and weights are assumptions that a flight surgeon can change in the app.

**Radiation budget meter:** dose used out of 600 mSv, with projection lines to arrival and end of mission; turns red if a single solar event would exceed the short-term limit.

### Reference Scenarios (270-day transit, mid-range rates, single deterministic run)

| Scenario | Hip bone loss | Leg muscle loss | VO2 loss | Readiness | Status |
|---|---|---|---|---|---|
| Full exercise every day | 10.6% | 18.3% | 16.6% | 80 | GREEN |
| Half of the prescribed exercise | 13.1% | 35.5% | 27.5% | 53 | AMBER |
| No exercise | 15.5% | 49.1% | 33.3% | 24 | RED |

Monte Carlo medians and P5–P95 bands will replace these once the engine is built.

**Sanity checks:** full-exercise hip loss of 10.6% sits inside the published 9–13.5% estimate for a 9-month transit; no-exercise muscle loss of ~49% matches ESA's "up to 50%".

**Radiation:** 270 days × 1.3 mSv = **351 mSv** on arrival (59% of the career limit) under the design-goal rate; ~**490 mSv** under the measured MSL/RAD cruise rate.

---

## Data Strategy

The system uses three layers of data. Only the astronauts themselves are simulated, and every screen says so.

| Layer | What | Source |
|---|---|---|
| 1. Real space data | Solar events, proton flux, spacecraft geometry | DONKI, NOAA, JPL Horizons (APIs below) |
| 2. Real science | Loss rates, spreads, limits | Published spaceflight & bed-rest studies, NASA standards |
| 3. Virtual crew | 4 named astronauts + Monte Carlo cohort, daily logs | Our generator, built from layers 1–2 |

### Why there is no astronaut data API — and how we handle it

Individual astronaut bone, muscle and VO2 measurements are **not public**. They live in NASA's Life Sciences Data Archive (LSDA) under controlled access (months-long application). NASA OSDR is mostly rodent and cell data. ARES Twin therefore uses a **virtual population** approach — the same method used for "virtual patients" in in-silico clinical trials:

1. **Population statistics, not individual records.** Extract mean ± SD for each rate from published tables (e.g. hip loss %/month, calf volume loss at 6 months, VO2peak change).
2. **Personal rates are draws.** Each astronaut's rates are sampled from those distributions (log-normal / truncated normal so rates stay positive). The 4 named crew are 4 chosen draws; Monte Carlo runs are hundreds more.
3. **Realistic baselines.** Absolute starting values (g/cm², mL/kg/min) are drawn from **NHANES** (public CDC survey with real DXA bone scans and fitness tests), filtered to astronaut-like demographics (age 35–50, healthy, fit). The model itself works in *relative* change, so baselines only affect display units.
4. **Calibrate, then validate on held-out data.** Simulate ~1,000 virtual astronauts on a 6-month ISS mission; tune the assumptions (`k_bone`, `r_none`, `V_floor`) until the cohort's mean and spread match published ISS results; then test against studies *not* used for tuning (e.g. bed rest).
5. **The twin learns from check-ups (hidden-truth experiment).** A secret "true" astronaut with hidden rates generates noisy monthly measurements (DXA precision ~1–2%). The twin starts from the population prior and applies a Bayesian update after each check-up; the demo shows the forecast converging to the truth and the uncertainty band narrowing. Because `log(BMD)` falls roughly linearly in time, the bone-rate update is a closed-form Gaussian update.
6. **Ready for real data.** A measurement form / CSV upload ("day 90: hip BMD 0.98") feeds the same updater, so real crew data can replace the hidden truth without code changes.

### Synthetic Crew Profiles

| Crew member | Role | Hip bone loss rate | Muscle sensitivity | Prior career dose | Exercise habit |
|---|---|---|---|---|---|
| **CDR Rahman** | Commander | 1.2% / month | normal | 90 mSv | 95% compliance |
| **Dr. Okafor** | Medical Officer | 1.0% / month | low | 0 mSv | 90% compliance |
| **Eng. Silva** | Flight Engineer | 1.5% / month | high | 150 mSv | 75% compliance |
| **Sci. Tanaka** | Science Specialist | 1.3% / month | normal | 40 mSv | 85% compliance |

All four are fictional; their rates sit inside the published ranges.

### Daily Logs and Injected Events

Each day generates resistance minutes, cardio minutes and sleep hours with noise around the astronaut's habit, plus events seen on real missions:

- **Sick days** — 2–3 random days per month with zero exercise
- **Injury** — 2–3 week block with no resistance exercise (e.g. wrist sprain)
- **Equipment failure** — exercise device down for 5 days, whole crew affected
- **Sleep loss** — a week of 5-hour nights around a busy operations period
- **Solar storm** — a real DONKI/NOAA event date; crew may or may not reach the shelter

---

## External APIs

All endpoints below were tested on **2026-10-06**. None require an API key.

| API | Purpose in ARES Twin | Endpoint / example | Format |
|---|---|---|---|
| **NASA CCMC DONKI** | Solar particle events (SEP), flares (FLR), CMEs, geomagnetic storms (GST) — event dates and links | `https://ccmc.gsfc.nasa.gov/DONKI-API/get/SEP?startDate=2024-05-01&endDate=2024-05-31` (also `/FLR`, `/CME`, `/GST`) | JSON |
| **NOAA Solar Proton Event list** | Peak >10 MeV proton flux (pfu) per event since 1976 → storm size | `https://umbra.nascom.nasa.gov/SEP/` | HTML table (scrape once, cache) |
| **NOAA NCEI GOES-16/18 SGPS archive** | Historical proton flux time series (1-min / 5-min) | `https://data.ngdc.noaa.gov/platforms/solar-space-observing-satellites/goes/goes16/l2/data/sgps-l2-avg5m/` | netCDF |
| **NOAA SWPC real-time** | Live proton flux for an optional "live mode" | `https://services.swpc.noaa.gov/json/goes/primary/integral-protons-1-day.json` | JSON |
| **JPL Horizons** | Earth & Mars positions → spacecraft heliocentric distance and daily comm delay (≈3–22 min) | `https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND='499'&EPHEM_TYPE=VECTORS&CENTER='500@10'&START_TIME='2024-05-01'&STOP_TIME='2024-05-03'&STEP_SIZE='1d'` | JSON / text |
| **NASA CDAWeb HAPI** *(optional)* | ACE / SOHO / STEREO energetic-particle data | `https://cdaweb.gsfc.nasa.gov/hapi/catalog` | HAPI JSON / CSV |
| **NASA OSDR RadLab** *(optional)* | ISS dosimeter data for calibrating dose rates | `https://visualization.osdr.nasa.gov/radlab/` (API requires column parameters) | JSON / CSV |
| **NASA OSDR Biological Data API** *(optional)* | Rodent/cell spaceflight data for curve-shape checks | `https://visualization.osdr.nasa.gov/biodata/api/` | JSON (OpenAPI 3.1) |
| **CCMC Mars SEP Scoreboard** *(bonus)* | Model forecasts of SEP intensity at Mars | `https://sep.ccmc.gsfc.nasa.gov/mars_intensity` | Web app |
| **CDC NHANES** | Real human DXA bone density and fitness data for baseline distributions | `https://wwwn.cdc.gov/nchs/nhanes/` | XPT files |

> ⚠️ **DONKI moved on 2026-09-30.** The old `https://api.nasa.gov/DONKI/...` and `https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/...` URLs now redirect to a notice page. Use `https://ccmc.gsfc.nasa.gov/DONKI-API/get/...` — parameters and JSON format are unchanged, and no `api_key` is needed.

### Space-Weather Processing Rules

1. **De-duplicate SEP records.** DONKI files one SEP record *per instrument*, so a single storm appears several times (May 2024: 14 records ≈ 4 real events). Group records sharing a `linkedEvents` flare/CME `activityID`, or merge records within 24 h, before assigning dose.
2. **Size events by proton flux, not flare class.** DONKI says *that* an event happened, not how strong it was. Use the peak >10 MeV flux from the NOAA list or GOES data, map it to the NOAA **S-scale**, and map the S-scale to a dose:

   | NOAA scale | Peak >10 MeV flux (pfu) | Unshielded dose (mSv) |
   |---|---|---|
   | S1 | ≥ 10 | *assumption — to be set in `spe_dose_map.json`* |
   | S2 | ≥ 100 | *assumption* |
   | S3 | ≥ 1,000 | *assumption* |
   | S4 | ≥ 10,000 | *assumption* |
   | S5 | ≥ 100,000 | *assumption* |

   The mapping is shown inside the app so judges can see it.
3. **Scale by distance.** Multiply Earth-observed event dose by `(1 AU / r)²` using the spacecraft distance from Horizons (a stated simplification — real exposure depends on magnetic connectivity, particle energy and shielding).
4. **Replay history as a mission.** Pick a real window (e.g. 2024-01-01 → 2024-09-30, which includes the strong May 2024 storms). Day 1 of the mission = first date; the crew lives through the real solar weather of that period.
5. **Cache everything.** Save every response as JSON under `backend/app/data/donki_cache/` so the demo works offline and never hits rate limits on stage.

---

## What-if Simulator

The remaining mission is re-run from today's state when the user changes:

- Resistance exercise days per week (0–7)
- Cardio minutes per day (0–60)
- Sleep hours per night (4–9)
- Injury block (start day and length)
- Solar storm (date, and whether the crew reached the shelter)
- GCR scenario (design goal vs. measured)

Every change shows before/after side by side, e.g. *"3 weeks without resistance exercise: leg muscle loss ↑, readiness ↓"*.

## Countermeasure Optimizer

Runs the simulator backwards to find the cheapest plan that reaches a goal:

1. **Goal:** e.g. arrival readiness ≥ 75 in 90% of Monte Carlo runs.
2. **Search space:** resistance days/week (0–7) × cardio minutes/day (0–60, step 10) = 56 plans.
3. **Cost:** total crew exercise minutes per week.
4. **Method:** simulate all 56 plans × 200 runs as one vectorised batch, drop plans that miss the goal, return the cheapest.
5. **Output:** *"Minimum plan: N resistance days + M min cardio per day. Saves X hours/week versus the default plan."*

---

## Development Phases Roadmap

The simulation engine comes before the database: everything else depends on it, and crew data can live in JSON until the engine is proven.

- [x] **Phase 1: Project Foundation** — Next.js JS/Tailwind frontend, FastAPI backend, Health API, environment setup
- [ ] **Phase 2: Core Simulation Engine** — `params.py` with sources, bone/muscle/cardio/radiation models; tests reproducing the reference scenarios
- [ ] **Phase 3: Monte Carlo Simulator** — 500 vectorised runs, per-astronaut rate draws, P5/P50/P95 bands
- [ ] **Phase 4: Readiness Scoring Engine** — sub-scores, composite score, GREEN/AMBER/RED bands, radiation budget
- [ ] **Phase 5: Virtual Crew & Daily Logs** — 4 crew members, NHANES-based baselines, injected events, calibration against published ISS cohorts
- [ ] **Phase 6: Space-Weather Integration** — DONKI (new CCMC URL), NOAA proton flux, JPL Horizons, de-duplication, S-scale dose map, JSON cache
- [ ] **Phase 7: Database Layer & API Endpoints** — SQLite/SQLAlchemy, CRUD, `/simulate`, `/whatif`, `/optimize`, `/spaceweather`, `/crew`
- [ ] **Phase 8: Bayesian Twin Updater** — hidden-truth experiment, check-up measurement input, posterior forecast bands
- [ ] **Phase 9: Frontend Mission Dashboard** — crew overview cards, astronaut twin view, radiation meter, comm-delay HUD
- [ ] **Phase 10: What-if Simulator & Optimizer UI** — sliders, before/after comparison, minimum-plan search
- [ ] **Phase 11: Scientific Analysis & Notebooks** — validation against held-out ISS/bed-rest studies, ±25% sensitivity analysis
- [ ] **Phase 12: Automated Test Suite & Polish** — end-to-end tests, "About the model" page, demo script and backup video

---

## Quick Start (Phase 1)

### 1. Backend Setup (FastAPI)

```bash
# Navigate to backend directory
cd backend

# (Optional) Setup virtual environment
python -m venv .venv
# On Windows:
.venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run backend development server
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Run tests
pytest
```

Verify backend health:
- URL: `http://127.0.0.1:8000/api/health`
- Interactive API Docs: `http://127.0.0.1:8000/docs`

### 2. Frontend Setup (Next.js)

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start Next.js development server
npm run dev
```

Open `http://localhost:3000` to view the Mission Control landing interface verifying backend connectivity.

### 3. Environment Variables

Copy `.env.example` to `.env` at the repo root.

| Variable | Used by | Notes |
|---|---|---|
| `HOST`, `PORT`, `DEBUG`, `ENVIRONMENT` | Backend | Server settings |
| `CORS_ORIGINS` | Backend | Comma-separated allowed frontend origins |
| `DATABASE_URL` | Backend | SQLite path (relative to the working directory) |
| `NASA_API_KEY` | Backend | Only for `api.nasa.gov` services; **not needed** for the new DONKI endpoint |
| `NEXT_PUBLIC_API_URL` | Frontend | Backend base URL exposed to the browser |

---

## Validation Plan

- **Reproduce known numbers:** 6 months of full exercise → ~13% calf loss and 6–9% hip loss.
- **Match the 9-month range:** full-exercise hip loss inside the published 9–13.5% estimate.
- **Hit the extremes:** no-exercise muscle loss ≈ 50%.
- **Held-out validation:** compare against bed-rest studies not used for calibration.
- **Hidden-truth experiment:** show the Bayesian twin recovers a hidden astronaut's rates from noisy check-ups.
- **Sensitivity test:** change each assumption by ±25% and show which one moves readiness most.

## Known Limitations

- The astronauts are simulated; no individual astronaut data is used.
- The models are simple first-order equations, not full physiology.
- `k_bone`, `r_none`, the sleep penalty, `V_floor`, `s_shelter` and the SPE dose map are assumptions, labelled in the app.
- The effect of Mars's 0.38 g on bone loss is unknown; it is shown as scenarios, not a prediction.
- Converting an Earth-observed solar event to a crew dose at another location is a simplification.
- ARES Twin is decision support for crew and flight surgeons, not a diagnostic or medical device.

**Future work:** calibrate against real crew data via NASA LSDA controlled access; add kidney-stone and vision (SANS) risks; ingest live wearable data.

---

## Sources

- Astronaut bone loss on a nine-month Mars journey — SpaceDaily
- LeBlanc et al. — Cortical and trabecular bone loss from the spine and hip in long-duration spaceflight (PubMed)
- Risk of Early Onset Osteoporosis Due to Spaceflight — NASA NTRS
- Trappe et al. — Exercise in space: human skeletal muscle after 6 months aboard the ISS (J Appl Physiol, 2009)
- The Astronaut-Athlete (bed-rest muscle loss) — J Strength Cond Res
- Bone and muscle loss — ESA
- Temporal changes in astronauts' muscle and cardiorespiratory physiology — NASA NTRS
- Zeitlin et al. (2013) — Measurements of energetic particle radiation in transit to Mars on the Mars Science Laboratory, *Science*
- Hassler et al. (2014) — Mars' surface radiation environment measured with the Mars Science Laboratory's Curiosity rover, *Science*
- Design for Ionizing Radiation Protection, technical brief — NASA OCHMO; NASA-STD-3001
- NASA CCMC DONKI — https://ccmc.gsfc.nasa.gov/tools/DONKI/
- CCMC API migration notice — https://ccmc.gsfc.nasa.gov/news/major-updates/
- NOAA Space Weather Scales — https://www.swpc.noaa.gov/noaa-scales-explanation
- JPL Horizons API — https://ssd-api.jpl.nasa.gov/doc/horizons.html
- NASA OSDR / RadLab — https://osdr.nasa.gov
- CDC NHANES — https://wwwn.cdc.gov/nchs/nhanes/
- Human Research Roadmap — Evidence reports
