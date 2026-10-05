# ARES Twin — Astronaut Digital Twin Simulator

> **Simulation and Decision-Support System for Human Mars Missions**

ARES Twin is an advanced astronaut digital-twin simulation platform designed for deep-space mission planning and operational decision support. The platform models multivariable physiological degradation (bone mineral density, skeletal muscle volume, cardiovascular VO2 fitness, and cumulative radiation dose) under microgravity and deep-space conditions during a transit to Mars.

> **DISCLAIMER:**  
> ARES Twin is a simulation, research, educational, and decision-support prototype. It is **NOT** a certified medical device. All astronaut profiles are simulated/fictitious. Scientific assumptions are decoupled from empirical reference parameters.

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
  ├── Digital Twin Simulation (Phases 3+)
  ├── Readiness Evaluation Engine
  ├── Monte Carlo Stochastic Simulator
  ├── Exercise Prescription Optimizer
  └── NASA DONKI Space Weather Service
       │
       ▼
Database (SQLite / SQLAlchemy)
```

---

## Development Phases Roadmap

- [x] **Phase 1: Project Foundation** (Next.js JS/Tailwind frontend, FastAPI backend, Health API, environment setup)
- [ ] **Phase 2: Database Layer** (SQLite, SQLAlchemy models, 4 synthetic crew members, daily logs, CRUD APIs)
- [ ] **Phase 3: Core Simulation Engine** (Bone, Muscle, Cardio, Radiation daily recurrence models)
- [ ] **Phase 4: Readiness Scoring Engine** (Subsystem quadratic penalties, composite score, Green/Amber/Red thresholds)
- [ ] **Phase 5: Monte Carlo Simulator** (500 runs, parameter uncertainties, P5/P50/P95 bands)
- [ ] **Phase 6: NASA DONKI Integration** (Live space-weather adapter, caching, SPE dose mapping)
- [ ] **Phase 7: Frontend Mission Dashboard** (Mission overview, crew status cards, telemetry HUD)
- [ ] **Phase 8: Digital Twin Detailed View** (Interactive silhouette system breakdown, trajectory graphs)
- [ ] **Phase 9: What-if Simulator** (Dynamic scenario controls, intervention comparisons)
- [ ] **Phase 10: Multi-Objective Optimizer** (Minimum exercise plan discovery to preserve readiness >= 75)
- [ ] **Phase 11: Scientific Analysis & Notebooks** (Validation against empirical bedrest/ISS studies)
- [ ] **Phase 12: Automated Test Suite & Polish** (Comprehensive end-to-end and unit testing)

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

---

## Synthetic Crew Profiles

1. **CDR Rahman** (Commander) — Hip Loss: 1.2%/mo | Muscle Sensitivity: Normal | Prior Dose: 90 mSv | Compliance: 95%
2. **Dr. Okafor** (Medical Officer) — Hip Loss: 1.0%/mo | Muscle Sensitivity: Low | Prior Dose: 0 mSv | Compliance: 90%
3. **Eng. Silva** (Flight Engineer) — Hip Loss: 1.5%/mo | Muscle Sensitivity: High | Prior Dose: 150 mSv | Compliance: 75%
4. **Sci. Tanaka** (Science Specialist) — Hip Loss: 1.3%/mo | Muscle Sensitivity: Normal | Prior Dose: 40 mSv | Compliance: 85%
