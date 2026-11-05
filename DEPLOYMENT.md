# ARES Twin — Free Deployment Guide

This guide explains how to deploy both the **Frontend** and **Backend** of ARES Twin for **100% free** using modern cloud tiers (Vercel + Render / Koyeb).

---

## Architecture Overview

- **Frontend:** Next.js (App Router, Turbopack, Three.js / React Three Fiber) $\to$ **Vercel** (Free Tier)
- **Backend:** FastAPI (Python 3.12, SQLAlchemy, Uvicorn, Orbit & Space Weather Pipelines) $\to$ **Render** or **Koyeb** (Free Tier)
- **Database:** SQLite (Bundled in backend with auto-seeding virtual crew)

---

## Part 1: Deploy Backend (FastAPI on Render for Free)

### Step 1: Create Web Service on Render
1. Go to [render.com](https://render.com) and sign in with GitHub.
2. Click **New +** $\to$ **Web Service**.
3. Connect your GitHub repository `Abdur71/ARES-Twin`.
4. Fill in the deployment details:
   - **Name:** `ares-twin-backend`
   - **Region:** Any (e.g. `Oregon (US West)` or `Frankfurt (EU)`)
   - **Root Directory:** `backend` *(Important: set to `backend`)*
   - **Runtime:** `Python`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Plan:** `Free`

### Step 2: Add Environment Variables on Render
Under **Environment Variables**, add:
- `PYTHON_VERSION`: `3.12.2`
- `HOST`: `0.0.0.0`
- `DEBUG`: `false`
- `ENVIRONMENT`: `production`
- `CORS_ORIGINS`: `https://*.vercel.app` *(or your custom frontend URL)*

Click **Deploy Web Service**. Once deployed, Render will provide a free URL:
`https://ares-twin-backend.onrender.com`

Verify backend by opening: `https://ares-twin-backend.onrender.com/api/health`

---

## Part 2: Deploy Frontend (Next.js on Vercel for Free)

### Step 1: Import Project on Vercel
1. Go to [vercel.com](https://vercel.com) and sign in with GitHub.
2. Click **Add New...** $\to$ **Project**.
3. Select your repository `Abdur71/ARES-Twin`.
4. In the project setup screen:
   - **Framework Preset:** `Next.js`
   - **Root Directory:** Click **Edit** and select `frontend` *(Crucial: must select `frontend`)*

### Step 2: Set Environment Variables on Vercel
Under **Environment Variables**, add:
- **Key:** `NEXT_PUBLIC_API_URL`
- **Value:** `https://ares-twin-backend.onrender.com` *(your backend Render URL from Part 1, without trailing slash)*

Click **Deploy**.

---

## Alternative Free Backend: Koyeb or Railway

If using **Koyeb** or **Railway**:
1. Choose **Deploy with Dockerfile**.
2. Set Dockerfile path to: `backend/Dockerfile`
3. Expose port `8000` (Koyeb auto-maps port 8000).
4. Set environment variable:
   - `CORS_ORIGINS`: `https://*.vercel.app`

---

## Verification & Health Check

1. Open your Vercel URL: `https://your-app.vercel.app`
2. Check the mission clock, 3D trajectory view, and crew digital twin cards.
3. The status indicator will report `LIVE` communicating directly with your cloud FastAPI backend!
