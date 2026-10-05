# ARES Twin — Scientific Analysis & Validation Hub

This directory is dedicated to scientific modeling research, calibration experiments, parameter sensitivity analysis, and Monte Carlo validation for the ARES Twin astronaut simulation framework.

## Directory Structure

- `notebooks/` — Exploratory and reproducible Jupyter notebooks (01_model_validation, 02_monte_carlo_analysis, etc.).
- `validation/` — Empirical validation scripts comparing simulation curves against published spaceflight (ISS) and terrestrial bed-rest analog data.
- `experiments/` — Parameter sensitivity sweeps, scenario stress-testing, and optimizer test harnesses.
- `plots/` — Exported publication-ready graphs, uncertainty band visualizations, and trajectory charts.
- `reports/` — Scientific write-ups, model assumption registries, and mission safety summaries.

> **CRITICAL ARCHITECTURAL BOUNDARY:**  
> The production FastAPI application and Next.js frontend **DO NOT** depend on code or notebooks in this directory. Core models are implemented natively in `backend/app/simulation/`.
