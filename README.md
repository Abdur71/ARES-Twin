# ARES Twin — Astronaut Digital Twin Simulator

> **Simulation and Decision-Support System for Human Mars Missions**

ARES Twin gives every crew member a virtual body that forecasts their bone, muscle, heart fitness and radiation dose on Mars arrival day, and shows what to change today to arrive fit for duty.

> **DISCLAIMER:**
> ARES Twin is a simulation, research, educational, and decision-support prototype. It is **NOT** a certified medical device. All astronaut profiles are simulated/fictitious. Physiological rates come from published studies; space-weather inputs are real NASA/NOAA/JPL data; every assumption is labelled and tunable in the app.

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

## Quick Start

Requirements: Python 3.11+, Node.js 20+.

### 1. Backend (FastAPI)

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows (PowerShell: .venv\Scripts\Activate.ps1)
# source .venv/bin/activate       # macOS / Linux
pip install -r requirements.txt

uvicorn app.main:app --reload --port 8000
```

- Health: `http://127.0.0.1:8000/api/health`
- Interactive API docs: `http://127.0.0.1:8000/docs`

On first start the backend creates `backend/ares_twin.db` and seeds the four virtual crew members with 270 days of daily logs. Space-weather data is already cached in `backend/app/data/`, so the app works **offline** out of the box.

### 2. Frontend (Next.js)

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

### 3. Tests and validation

```bash
cd backend
pytest                                   # 47 tests: models, Bayesian updater, space weather, API

cd ..
backend/.venv/Scripts/python analysis/validation/validate_model.py   # writes analysis/reports/validation_report.md
```

### 4. Environment variables (optional)

Copy `.env.example` to `.env` at the repo root.

| Variable | Default | Notes |
|---|---|---|
| `HOST`, `PORT`, `DEBUG`, `ENVIRONMENT` | `127.0.0.1`, `8000`, … | Server settings |
| `CORS_ORIGINS` | `http://localhost:3000,…` | Comma-separated allowed frontend origins |
| `DATABASE_URL` | `sqlite:///./ares_twin.db` | Relative SQLite paths resolve against `backend/` |
| `DONKI_API_BASE` | `https://ccmc.gsfc.nasa.gov/DONKI-API/get` | New CCMC endpoint (no key) |
| `HORIZONS_API_URL` | `https://ssd.jpl.nasa.gov/api/horizons.api` | JPL Horizons |
| `SPACEWEATHER_OFFLINE` | `False` | `True` = cached JSON only, never call external APIs |
| `MISSION_START` | `2024-01-01` | First day of the real space-weather replay window |
| `MISSION_CURRENT_DAY` | `120` | Default "today" (the dashboard's mission clock can move it) |
| `NASA_API_KEY` | `DEMO_KEY` | Only for `api.nasa.gov` services; **not needed** for DONKI |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Backend base URL exposed to the browser |

---

## What's in the App

| Page | What it shows |
|---|---|
| **Mission** (`/`) | Mission clock (day, date, comm delay, distance from the Sun, data-source status), four crew cards with arrival readiness, losses and dose budget, recent/upcoming solar events |
| **Crew twin** (`/crew/[id]`) | Arrival status and readiness band, sub-score gauges, alerts, P5–P95 forecast charts for readiness/bone/muscle/VO2, radiation budget meter + career-dose chart (design-goal vs measured GCR), check-up entry that personalises the twin, mission log |
| **What-if** (`/whatif`) | Sliders for resistance days, cardio, sleep, adherence; injury block; injected solar storm (S1–S5, sheltered or not); GCR scenario — before/after comparison against "nothing changes" |
| **Optimizer** (`/optimize`) | Cheapest of 56 plans meeting a readiness goal at a chosen confidence; heatmap of every plan |
| **Space weather** (`/spaceweather`) | Data-source status, de-duplicated event table with DONKI links, SPE dose chart, spacecraft distance and comm-delay charts, S-scale dose map |
| **Twin lab** (`/twin-lab`) | Hidden-truth experiment: a secret astronaut, noisy check-ups, the twin converging; measured calibration over 200 hidden astronauts |
| **About the model** (`/about`) | Equations, parameter table with sources and types, readiness limits/weights, data sources, limitations |

The **mission clock** slider in the header sets "today" for every page: days before it use the logged history, days after it use the forward plan.

---

## Architecture

```
ARES-Twin/
├── frontend/                 # Next.js 16 (React 19, Tailwind 4, Recharts, Lucide)
│   ├── app/                  # pages: /, /crew/[id], /whatif, /optimize, /spaceweather, /twin-lab, /about
│   ├── components/           # AppShell (nav + mission clock), charts, UI primitives
│   └── lib/                  # API client, mission-clock context, chart/theme tokens
├── backend/                  # FastAPI (Python, NumPy, Pydantic, SQLAlchemy, SQLite)
│   ├── app/
│   │   ├── api/              # health, crew, simulation (what-if/optimize/twin), mission/spaceweather/model
│   │   ├── config/           # settings (pydantic-settings)
│   │   ├── simulation/
│   │   │   ├── params.py     # every rate and limit, with its source
│   │   │   ├── models.py     # bone / muscle / cardio / radiation daily updates (vectorised)
│   │   │   ├── simulate.py   # daily loop + Monte Carlo, P5/P50/P95 bands
│   │   │   ├── readiness.py  # sub-scores, composite score, status bands, radiation budget
│   │   │   ├── scenario.py   # logged history + forward plan → per-day inputs
│   │   │   ├── twin_update.py# Bayesian personalisation, hidden-truth experiment, calibration
│   │   │   └── optimize.py   # 56 plans × 200 runs in one vectorised batch
│   │   ├── spaceweather/     # DONKI, NOAA SEP list, JPL Horizons clients, JSON cache, assembly
│   │   ├── crew/generator.py # virtual crew daily logs with injected events
│   │   ├── db/               # SQLAlchemy models, seeding, repository
│   │   ├── services/twin.py  # glue: DB + space weather + engine → API payloads
│   │   └── data/             # crew.json + cached API responses (donki_cache, noaa_cache, horizons_cache)
│   └── tests/                # pytest suite (offline, temporary DB)
└── analysis/
    ├── validation/validate_model.py   # published-number checks + ±25 % sensitivity
    └── reports/validation_report.md   # generated report
```

> The production app does **not** import from `analysis/`; the analysis scripts import the backend engine.

### Data Flow

```
Browser (Next.js)  ──REST/JSON──▶  FastAPI
                                     ├── SQLite: crew profiles, 270 daily logs each, check-up measurements
                                     ├── Space-weather service ──▶ DONKI · NOAA SEP list · JPL Horizons
                                     │        (parallel requests, JSON cache, offline fallback)
                                     └── Engine: daily loop × 500 Monte Carlo runs → readiness, alerts, budget
```

### API Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness |
| GET | `/api/mission?day=` | Mission clock: date, distance from Sun, comm delay, source status |
| GET | `/api/crew?day=` | Crew overview cards |
| GET | `/api/crew/{id}?day=&gcr_scenario=` | Full twin: forecast bands, gauges, alerts, radiation budget, posterior rates |
| GET | `/api/crew/{id}/logs` | Daily logs |
| GET/POST | `/api/crew/{id}/measurements` | List / add a check-up (bone g/cm², muscle kg, VO2 mL/kg/min) |
| DELETE | `/api/crew/{id}/measurements/{mid}` | Remove a check-up |
| POST | `/api/whatif` | Scenario vs "nothing changes" |
| GET | `/api/whatif/defaults/{id}` | Slider defaults (current habits) |
| POST | `/api/optimize` | Cheapest plan meeting a readiness goal |
| POST | `/api/twin/experiment` | Hidden-truth experiment + calibration |
| GET | `/api/spaceweather?refresh=` | Events, trajectory, dose map, source status |
| GET | `/api/model` | Equations, parameter registry, limits, weights |

---

## The Physiological Models

Each sub-model is one short first-order equation updated once per day. Two **compliance** values link exercise to the models — the share of the prescribed plan actually done that day (0 = none, 1 = full plan; prescription = 60 min resistance × 7 days + 60 min cardio per day):

$$c^{res}_t = \min\left(1, \frac{\text{resistance minutes done}_t}{60}\right), \qquad c^{cardio}_t = \min\left(1, \frac{\text{cardio minutes done}_t}{60}\right)$$

Resistance compliance drives **bone and muscle**; cardio compliance drives **VO2peak**.

### Bone

Published loss rates were measured *with* ISS exercise, so they are treated as the full-compliance rate and scaled up when exercise is missed:

$$BMD_{t+1} = BMD_t \times \left(1 - \frac{r_{bone}}{30} \times \left[1 + k_{bone}(1 - c^{res}_t)\right] \times g\right)$$

- `r_bone` = 1.0–1.5% / month (hip), 0.9% / month (spine) — personal value per astronaut
- `k_bone` = 0.5 (**assumption**, tunable)
- `g` = 1.0 in transit (the Mars-surface effect of 0.38 g is unknown and not modelled in this version)

### Muscle

$$M_{t+1} = M_t \times \left(1 - m \left[c^{res}_t \cdot r_{ex} \cdot \sigma_t + (1 - c^{res}_t) \cdot r_{none}\right]\right)$$

- `r_ex` ≈ 0.075% / day (−13% calf volume in 180 days, Trappe et al. 2009)
- `r_none` ≈ 0.25% / day (**assumption** fitted to bed rest, 18–30% in 90–120 days, and ESA's "up to 50%")
- `σ_t` = 1.2 when sleep < 6 h, else 1.0 (**assumption**)
- `m` = personal sensitivity multiplier (low 0.85, normal 1.0, high 1.2 — **assumption**)

### Cardio (VO2peak)

$$V_{t+1} = V_t - \lambda\, m_c\,(1 - 0.7\,c^{cardio}_t)\,(V_t - V_{floor})$$

- `V_floor` = **60%** of baseline (**assumption**, so the cardio sub-score can reach its 40% limit)
- `λ` = 0.00661 / day — calibrated so full compliance gives −12% over 6 months (ISS observed 10–15%)
- `m_c` = personal multiplier

### Radiation

$$D_{t+1} = D_t + d_{GCR} + E_{SPE,t} \times \left(\frac{1\,\text{AU}}{r_t}\right)^{2} \times s_{shelter}$$

- `d_GCR` — two selectable scenarios: **design goal** 1.3 mSv/day transit / 0.8 surface (NASA OCHMO); **measured** ~1.84 cruise / ~0.64 surface (MSL/RAD: Zeitlin et al. 2013, Hassler et al. 2014)
- `E_SPE,t` — dose from a real solar particle event that day, from its NOAA peak flux via the S-scale dose map below
- `r_t` — spacecraft distance from the Sun (1.0 → 1.52 AU), from JPL Horizons + a nominal transfer orbit
- `s_shelter` = 0.2 if the crew reached the storm shelter (**assumption**); by default the crew shelters for S2 and above

### Parameter Table

| Parameter | Value | Type | Source |
|---|---|---|---|
| Hip bone loss | 1.0–1.5% / month | Measured | LeBlanc et al. 2000 |
| Spine bone loss | 0.9% / month | Measured | LeBlanc et al. 2000 |
| Calf volume loss, full exercise | −13% in 6 months | Measured | Trappe et al., J Appl Physiol 2009 |
| Muscle loss, no exercise | up to −50% (long missions) | Estimate | ESA |
| VO2peak, muscle, strength loss | −10 to −15% | Measured | NASA NTRS |
| GCR dose rate (design goal) | 1.3 / 0.8 mSv per day | NASA design goal | NASA OCHMO |
| GCR dose rate (measured) | ~1.84 cruise / ~0.64 surface mSv per day | Measured | MSL/RAD (Zeitlin 2013, Hassler 2014) |
| Career dose limit | < 600 mSv | NASA standard | NASA-STD-3001 / OCHMO |
| Short-term limit | 250 mGy-Eq (30-day, blood-forming organs) — *verify against current NASA-STD-3001* | NASA standard | NASA OCHMO |
| `k_bone`, `r_none`, `σ`, `m`, `V_floor`, `s_shelter`, SPE dose map | see above | **Our assumption** | Labelled as tunable in the app |

---

## Readiness Score

Radiation is shown separately as a dose budget (long-term cancer risk, not fitness on landing day). The other three systems combine into one 0–100 score:

$$S_i = \max\left(0,\ 1 - \left(\frac{\text{loss}_i}{\text{limit}_i}\right)^2\right), \qquad \text{Readiness} = 100 \times (0.35\,S_{bone} + 0.35\,S_{muscle} + 0.30\,S_{cardio})$$

| System | Limit where score = 0 | Weight |
|---|---|---|
| Hip bone density | 20% loss | 0.35 |
| Leg muscle volume | 50% loss | 0.35 |
| Aerobic fitness (VO2peak) | 40% loss | 0.30 |

**Status bands:** GREEN ≥ 70 · AMBER 50–69 · RED < 50. Any sub-score below 0.4 caps the status at AMBER.

**Radiation budget:** dose used out of 600 mSv, with projections to arrival and to the end of a conjunction-class mission (270 d out + 500 d surface + 270 d back). RED if the arrival dose exceeds the limit or any single event exceeds the short-term limit.

### Validation Results

From `analysis/reports/validation_report.md` (mid-range rates, 270-day transit unless stated):

| Check | Published | Model |
|---|---|---|
| Hip BMD loss, 6 months full exercise | 6–9% | 7.2% |
| Calf/leg muscle loss, 6 months full exercise | ~13% | 12.6% |
| VO2peak loss, 6 months full exercise | 10–15% | 12.0% |
| Hip BMD loss, 9-month transit full exercise | 9–13.5% | 10.6% |
| Leg muscle loss, 9 months no exercise | up to 50% | 49.1% |
| Muscle loss, 105 days no exercise (bed rest) | 18–30% | 23.1% |

| Exercise compliance | Hip bone loss | Leg muscle loss | VO2 loss | Readiness | Status |
|---|---|---|---|---|---|
| 100% | 10.6% | 18.3% | 16.6% | 80 | GREEN |
| 75% | 11.9% | 27.4% | 22.9% | 67 | AMBER |
| 50% | 13.1% | 35.5% | 27.5% | 53 | AMBER |
| 0% | 15.5% | 49.1% | 33.3% | 24 | RED |

**Sensitivity (±25% on each assumption, 75% compliance):** the cardio exercise-effect factor (0.7) moves arrival readiness most (10.5-point swing), then `r_none` (4.7) and `r_ex` (4.2); `k_bone` matters least (1.3).

**Radiation:** 270 days × 1.3 mSv = **351 mSv** on arrival under the design-goal rate (~497 mSv under the measured MSL/RAD rate), before solar events and prior career dose.

---

## Data Strategy

| Layer | What | Source |
|---|---|---|
| 1. Real space data | Solar events, proton flux, spacecraft geometry | DONKI, NOAA, JPL Horizons |
| 2. Real science | Loss rates, spreads, limits | Published spaceflight & bed-rest studies, NASA standards |
| 3. Virtual crew | 4 named astronauts + Monte Carlo cohort, daily logs | Our generator, built from layers 1–2 |

### No astronaut data API — the virtual-population approach

Individual astronaut bone, muscle and VO2 measurements are **not public** (NASA LSDA, controlled access). ARES Twin uses a **virtual population**, the same method as "virtual patients" in in-silico trials:

1. **Population statistics, not records** — each personal rate is drawn from published mean ± spread (log-normal).
2. **Named crew = chosen draws** — 4 astronauts with rates inside published ranges; Monte Carlo runs are hundreds more draws around each.
3. **Realistic baselines** — hip BMD, DXA leg lean mass and VO2peak within NHANES ranges for healthy adults aged 35–50 (the model itself works in relative change).
4. **Calibrate, then validate** — see Validation Results above.
5. **The twin learns from check-ups** — each measurement triggers a closed-form Gaussian update of the personal rate (log-linear in time). Weights for VO2 tests use the twin's *predicted* gap to the floor, which removes a bias that measured-gap weights cause.
6. **Hidden-truth test** — a secret astronaut generates noisy monthly check-ups (DXA ±1.5%, muscle ±3%, VO2 ±4%); over 200 hidden astronauts the twin's 90% credible band contains the true rate 89–92% of the time (bone 89%, muscle 92%, cardio 90%).
7. **Ready for real data** — the crew page's check-up form feeds the same updater.

### Synthetic Crew Profiles

| Crew member | Role | Hip bone loss rate | Muscle sensitivity | Prior career dose | Exercise adherence | Sleep |
|---|---|---|---|---|---|---|
| **CDR Rahman** | Commander | 1.2% / month | normal | 90 mSv | 95% | 6.8 h |
| **Dr. Okafor** | Medical Officer | 1.0% / month | low | 0 mSv | 90% | 7.0 h |
| **Eng. Silva** | Flight Engineer | 1.5% / month | high | 150 mSv | 75% | 6.3 h |
| **Sci. Tanaka** | Science Specialist | 1.3% / month | normal | 40 mSv | 85% | 6.6 h |

All four are fictional. Daily logs (deterministic per astronaut) include:

- **Sick days** — 2–3 random days per month with no exercise
- **Injury** — Eng. Silva: wrist sprain, no resistance exercise on days 60–80
- **Equipment failure** — resistance device down on days 150–154, whole crew
- **Sleep loss** — busy operations week, 5-hour nights on days 200–206
- **Solar storms** — the real 2024 events, sheltered for S2 and above

---

## External APIs

All endpoints below were tested on **2026-10-06/07**. None require an API key.

| API | Purpose in ARES Twin | Endpoint | Format |
|---|---|---|---|
| **NASA CCMC DONKI** | Solar particle events (SEP) and flares (FLR) — event records, instruments, links | `https://ccmc.gsfc.nasa.gov/DONKI-API/get/SEP?startDate=2024-01-01&endDate=2024-02-29` (also `/FLR`, `/CME`, `/GST`) | JSON |
| **NOAA SWPC solar proton event list** (NCEI copy) | Peak >10 MeV flux (pfu) for every event 1976 → 2025 — storm size | `https://www.ngdc.noaa.gov/stp/space-weather/interplanetary-data/solar-proton-events/SEP%20page%20code.html` | HTML table (parsed, cached) |
| **JPL Horizons** | Earth's heliocentric position per day → spacecraft distance from Sun and comm delay | `https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND='399'&EPHEM_TYPE='VECTORS'&CENTER='500@10'&…` | JSON |
| NOAA NCEI GOES-16/18 SGPS *(future)* | Historical proton flux time series | `https://data.ngdc.noaa.gov/platforms/solar-space-observing-satellites/goes/goes16/l2/data/sgps-l2-avg5m/` | netCDF |
| NOAA SWPC real-time *(future live mode)* | Live proton flux | `https://services.swpc.noaa.gov/json/goes/primary/integral-protons-1-day.json` | JSON |
| NASA OSDR RadLab *(optional)* | ISS dosimeter data for calibration | `https://visualization.osdr.nasa.gov/radlab/` | JSON / CSV |
| CCMC Mars SEP Scoreboard *(bonus)* | Model SEP forecasts at Mars | `https://sep.ccmc.gsfc.nasa.gov/mars_intensity` | Web app |
| CDC NHANES | Human DXA and fitness data for baseline ranges | `https://wwwn.cdc.gov/nchs/nhanes/` | XPT files |

> ⚠️ **DONKI moved on 2026-09-30.** The old `https://api.nasa.gov/DONKI/...` and `https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/...` URLs now redirect to a notice page. The new `https://ccmc.gsfc.nasa.gov/DONKI-API/get/...` needs no key, and **rejects date ranges longer than 60 days** (HTTP 400) — ARES Twin splits windows into ≤60-day chunks.
>
> The older NOAA list mirror at `umbra.nascom.nasa.gov/SEP/` stops in 2017; use the NCEI copy above.

### How ARES Twin Uses the APIs Efficiently

- **One request per source per window**, all sources fetched **in parallel** (DONKI as five ≤60-day chunks, at most three in flight). The full 270-day window costs 12 requests, about 4 s, once.
- **JSON cache** under `backend/app/data/{donki,noaa,horizons}_cache/`: windows fully in the past are cached forever, the NOAA list for 7 days, recent windows for 1 hour. The repo ships with the 2024 window cached, so the demo runs offline.
- **In-process memo** — the assembled space weather is built once per server run.
- **Graceful degradation** — retries (2), timeouts, stale cache on failure (reported as `stale-cache`), analytic Earth orbit if Horizons is unavailable; the UI shows each source's status.

### Space-Weather Processing

1. **NOAA events are the anchor.** Each NOAA event in the window gives a date and peak >10 MeV flux.
2. **DONKI records are attached and de-duplicated.** DONKI files one SEP record *per instrument* (2024-01-01 → 2024-09-27: 89 records). Each record is attached to the nearest NOAA event within ±24 h; leftovers are grouped by shared linked flare/CME IDs or a 24 h window and listed as "below S1 at Earth" (21 distinct events in total, 10 at S1 or above).
3. **Size by flux, not flare class.** Peak flux → NOAA S-scale → unsheltered dose inside the hull at 1 AU, log-log interpolated (**assumption**):

   | NOAA scale | Peak >10 MeV flux (pfu) | Dose at 1 AU (mSv) |
   |---|---|---|
   | S1 | ≥ 10 | 0.5 |
   | S2 | ≥ 100 | 2 |
   | S3 | ≥ 1,000 | 10 |
   | S4 | ≥ 10,000 | 50 |
   | S5 | ≥ 100,000 | 200 |

4. **Scale by distance** — `× (1 AU / r)²` with `r` from the trajectory (simplification: real exposure depends on magnetic connectivity, spectrum and shielding).
5. **Trajectory** — Earth's real position from Horizons; the spacecraft follows a Hohmann-type ellipse from Earth's departure point stretched to 270 days. One-way comm delay grows from 0 to ~14.5 min over the transit (up to 22 min at worst-case geometry).

---

## What-if Simulator and Optimizer

**What-if** re-runs the remaining mission from "today" with changed resistance days/week (0–7), cardio min/day (0–60), sleep (4–9 h), adherence, an injury block, an added solar storm (S1–S5, sheltered or not), and the GCR scenario. Baseline and scenario use the same Monte Carlo draws, so the difference comes from the scenario, not sampling noise.

**Optimizer** searches resistance days/week (0–7) × cardio min/day (0–60, step 10) = 56 plans × 200 runs in one vectorised batch (~0.2 s), drops plans that miss the goal (default: readiness ≥ 75 in 90% of runs), and returns the cheapest by weekly exercise minutes. Plans are assumed followed as prescribed unless "usual adherence" is ticked. If no plan meets the goal — common later in the mission or for low-adherence crew — it says so and shows the closest plan.

---

## Development Phases

- [x] **Phase 1: Project Foundation** — Next.js frontend, FastAPI backend, Health API
- [x] **Phase 2: Core Simulation Engine** — sourced parameters, four sub-models, reference-scenario tests
- [x] **Phase 3: Monte Carlo Simulator** — 500 vectorised runs, P5/P50/P95 bands
- [x] **Phase 4: Readiness Scoring Engine** — sub-scores, bands, AMBER cap, radiation budget
- [x] **Phase 5: Virtual Crew & Daily Logs** — 4 crew, injected events
- [x] **Phase 6: Space-Weather Integration** — DONKI (new URL, 60-day chunks), NOAA flux list, JPL Horizons, de-duplication, dose map, cache
- [x] **Phase 7: Database Layer & API Endpoints** — SQLite/SQLAlchemy, crew/logs/measurements, simulation endpoints
- [x] **Phase 8: Bayesian Twin Updater** — check-ups, hidden-truth experiment, calibration
- [x] **Phase 9: Frontend Mission Dashboard** — crew cards, twin view, radiation meter, mission clock
- [x] **Phase 10: What-if Simulator & Optimizer UI**
- [x] **Phase 11: Scientific Analysis** — validation script + ±25% sensitivity report
- [x] **Phase 12: Automated Test Suite** — 47 backend tests (offline, temporary DB)

**Next ideas:** NHANES-derived baseline draws in `analysis/`; GOES flux time series for event fluence instead of peak flux; Mars surface stay and return leg; strength and sleep sub-models; kidney-stone and SANS risks; live wearable data.

---

## Known Limitations

- The astronauts are simulated; no individual astronaut data is used.
- The models are first-order equations, not full physiology.
- `k_bone`, `r_none`, the sleep penalty, sensitivity multipliers, `V_floor`, `s_shelter` and the SPE dose map are assumptions, labelled in the app.
- Converting an Earth-observed solar event into a crew dose elsewhere is a simplification; the spacecraft flies a nominal orbit during a historical replay window, not a real launch opportunity.
- Mars's 0.38 g effect on bone is unknown; this version models the transit only.
- ARES Twin is decision support for crew and flight surgeons, not a diagnostic or medical device.

---

## Sources

- LeBlanc et al. (2000) — Bone mineral and lean tissue loss after long duration space flight (spine and hip)
- Risk of Early Onset Osteoporosis Due to Spaceflight — NASA NTRS
- Trappe et al. (2009) — Exercise in space: human skeletal muscle after 6 months aboard the ISS, *J Appl Physiol*
- Bone and muscle loss — ESA
- Temporal changes in astronauts' muscle and cardiorespiratory physiology — NASA NTRS
- Zeitlin et al. (2013) — Measurements of energetic particle radiation in transit to Mars on the Mars Science Laboratory, *Science*
- Hassler et al. (2014) — Mars' surface radiation environment measured with the Mars Science Laboratory's Curiosity rover, *Science*
- NASA-STD-3001 and OCHMO technical briefs — radiation limits and design goals
- NASA CCMC DONKI — https://ccmc.gsfc.nasa.gov/tools/DONKI/ · migration notice https://ccmc.gsfc.nasa.gov/news/major-updates/
- NOAA SWPC solar proton events and Space Weather Scales — https://www.swpc.noaa.gov/noaa-scales-explanation
- JPL Horizons API — https://ssd-api.jpl.nasa.gov/doc/horizons.html
- CDC NHANES — https://wwwn.cdc.gov/nchs/nhanes/
- NASA Human Research Roadmap — evidence reports
