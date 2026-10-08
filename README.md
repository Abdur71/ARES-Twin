# ARES Twin frontend

Next.js 16, React 19, Tailwind 4, react-three-fiber. Dark space theme with an orange-red accent.

```bash
npm install
npm run dev        # http://localhost:3000
```

Fonts (Syne, Manrope) load through `next/font/google`, so the first build needs internet access.

## What is inside

| Route | Content |
|---|---|
| `/` | Hero with 3D astronaut and Mars, 3D transit simulator driven by the mission clock, crew cards, solar events |
| `/crew/[id]` | Rotatable 3D astronaut, vector body twin, forecast bands, radiation budget, check-up comparison, alerts |
| `/whatif` | Sliders, injury, solar storm, GCR scenario, before/after comparison |
| `/optimize` | Cheapest of 56 plans for a readiness goal, heatmap of every plan |
| `/spaceweather` | Event dose chart, distance and signal delay, storm scale table |
| `/about` | Equations, parameters, limitations |

## Data

`lib/engine.ts` is a TypeScript port of the README equations (bone, muscle, VO2, radiation, readiness, 200-run Monte Carlo, Hohmann-type trajectory, optimizer). The UI runs fully on it, so the backend is optional. The header badge shows **Live API** when `NEXT_PUBLIC_API_URL` answers `/api/health`, otherwise **Demo engine**.

Solar events in `EVENTS` are illustrative samples, not NASA/NOAA records. To use the FastAPI backend, replace the calls to `simulate`, `radiation` and `optimize` in the pages with fetches from `lib/api.ts` (`/api/crew`, `/api/whatif`, `/api/optimize`, `/api/spaceweather`).

## Performance and devices

- 3D canvases pause when off-screen, use adaptive pixel ratio, and need no image downloads (planet textures are generated procedurally).
- Touch: vertical swipes still scroll the page over the 3D views; horizontal drags rotate.
- Mobile gets a bottom pill navigation; desktop gets a top navigation. Respects `prefers-reduced-motion`.
