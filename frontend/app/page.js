"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Server,
  Layers,
  ShieldCheck,
  Compass,
  Cpu,
  Orbit,
  ExternalLink,
} from "lucide-react";

export default function HomePage() {
  const [mounted, setMounted] = useState(false);
  const [backendStatus, setBackendStatus] = useState("CHECKING");
  const [healthData, setHealthData] = useState(null);
  const [latency, setLatency] = useState(null);
  const [lastChecked, setLastChecked] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  const checkBackendHealth = useCallback(async () => {
    setBackendStatus("CHECKING");
    setErrorMessage("");
    const startTime = performance.now();

    try {
      const response = await fetch(`${apiUrl}/api/health`, {
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      });

      const elapsed = Math.round(performance.now() - startTime);
      setLatency(elapsed);

      if (response.ok) {
        const data = await response.json();
        setHealthData(data);
        if (data.status === "ok") {
          setBackendStatus("CONNECTED");
        } else {
          setBackendStatus("DEGRADED");
        }
      } else {
        setBackendStatus("DISCONNECTED");
        setErrorMessage(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (err) {
      setBackendStatus("DISCONNECTED");
      setErrorMessage(err.message || "Failed to reach backend endpoint");
    } finally {
      setLastChecked(new Date().toLocaleTimeString());
    }
  }, [apiUrl]);

  useEffect(() => {
    setMounted(true);
    checkBackendHealth();
    const interval = setInterval(checkBackendHealth, 15000);
    return () => clearInterval(interval);
  }, [checkBackendHealth]);

  return (
    <main className="flex-1 flex flex-col justify-between p-6 sm:p-10 lg:p-12 max-w-7xl mx-auto w-full">
      {/* Top Telemetry Bar */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-cyan-900/30">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-cyan-950/60 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.15)]">
            <Orbit className="h-5 w-5 animate-spin-slow" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono tracking-widest text-cyan-400 uppercase">
                ARES-TWIN-SIM // PHASE 1 FOUNDATION
              </span>
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-400 animate-ping"></span>
            </div>
            <p className="text-xs text-slate-400">Deep-Space Mission Decision Support System</p>
          </div>
        </div>

        <div className="flex items-center gap-3 font-mono text-xs text-slate-300">
          <div className="px-3 py-1.5 rounded bg-slate-900/80 border border-slate-800 flex items-center gap-2">
            <span className="text-slate-400">TARGET:</span>
            <span className="text-cyan-300 font-medium">MARS TRANSIT (270D)</span>
          </div>
          <div className="px-3 py-1.5 rounded bg-slate-900/80 border border-slate-800 flex items-center gap-2">
            <span className="text-slate-400">NODE:</span>
            <span className="text-emerald-400 font-medium">SYS-ALPHA</span>
          </div>
        </div>
      </header>

      {/* Main Core Verification Console */}
      <div className="py-12 lg:py-16 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Left Side: Mission Branding & Identity */}
        <div className="lg:col-span-7 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono font-medium tracking-wide bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
            <Compass className="h-3.5 w-3.5" />
            HUMAN MARS TRANSIT DIGITAL TWIN
          </div>

          <div className="space-y-2">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white font-sans">
              ARES <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-300 to-blue-500">Twin</span>
            </h1>
            <p className="text-xl sm:text-2xl text-slate-300 font-light tracking-wide">
              Astronaut Digital Twin Simulator
            </p>
          </div>

          <p className="text-slate-400 text-sm sm:text-base leading-relaxed max-w-2xl">
            A high-fidelity physiological degradation and readiness modeling platform.
            Projecting bone mineral loss, muscle atrophy, cardiovascular decline, and deep-space
            radiation accumulation for simulated human crews en route to Mars.
          </p>

          {/* Quick Specifications Matrix */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
            <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-800/80">
              <span className="text-xs text-slate-400 font-mono block">SIM CREW</span>
              <span className="text-sm font-semibold text-slate-200">4 Specialists</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-800/80">
              <span className="text-xs text-slate-400 font-mono block">TRANSIT DURATION</span>
              <span className="text-sm font-semibold text-slate-200">270 Days</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-800/80">
              <span className="text-xs text-slate-400 font-mono block">NASA DONKI FEED</span>
              <span className="text-sm font-semibold text-cyan-300">Phase 6 Ready</span>
            </div>
          </div>

          {/* Scientific Disclaimer */}
          <div className="p-4 rounded-lg bg-amber-950/20 border border-amber-500/20 text-xs text-amber-200/80 flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong className="text-amber-300 font-medium">RESEARCH & SIMULATION PROTOTYPE:</strong>{" "}
              This platform is not a certified medical diagnostic device. Astronaut records are synthetic,
              and mathematical models decouple empirical measurements from mission assumptions.
            </p>
          </div>
        </div>

        {/* Right Side: Telemetry Link & Status Card */}
        <div className="lg:col-span-5">
          <div className="technical-panel rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl relative overflow-hidden">
            {/* Ambient accent top bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-60"></div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="h-5 w-5 text-cyan-400" />
                <h2 className="text-sm font-semibold tracking-wide text-slate-200 uppercase font-mono">
                  Telemetry Link Status
                </h2>
              </div>
              <button
                onClick={checkBackendHealth}
                disabled={backendStatus === "CHECKING"}
                className="p-1.5 rounded-md hover:bg-slate-800 text-slate-400 hover:text-cyan-300 transition-colors disabled:opacity-50"
                title="Ping Backend API"
                aria-label="Refresh Backend Status"
              >
                <RefreshCw
                  className={`h-4 w-4 ${
                    backendStatus === "CHECKING" ? "animate-spin text-cyan-400" : ""
                  }`}
                />
              </button>
            </div>

            {/* Connection Display Box */}
            <div
              className={`p-6 rounded-xl border flex flex-col items-center justify-center gap-3 transition-all ${
                backendStatus === "CONNECTED"
                  ? "bg-emerald-950/20 border-emerald-500/30 text-emerald-400 glow-emerald"
                  : backendStatus === "CHECKING"
                  ? "bg-cyan-950/20 border-cyan-500/30 text-cyan-400 glow-cyan"
                  : "bg-rose-950/20 border-rose-500/30 text-rose-400 glow-rose"
              }`}
            >
              <div className="flex items-center gap-3">
                {backendStatus === "CONNECTED" && (
                  <CheckCircle2 className="h-7 w-7 text-emerald-400 animate-pulse" />
                )}
                {backendStatus === "CHECKING" && (
                  <Activity className="h-7 w-7 text-cyan-400 animate-spin" />
                )}
                {backendStatus === "DISCONNECTED" && (
                  <AlertTriangle className="h-7 w-7 text-rose-400 animate-bounce" />
                )}
                <span className="text-2xl font-black font-mono tracking-wider">
                  {backendStatus}
                </span>
              </div>

              <div className="text-xs font-mono text-slate-300 text-center space-y-0.5">
                <div>Backend Service: <span className="text-white font-medium">{healthData?.service || "ARES Twin Backend"}</span></div>
                {latency !== null && (
                  <div className="text-slate-400">Response Latency: <span className="text-cyan-300">{latency} ms</span></div>
                )}
              </div>
            </div>

            {/* API Diagnostics Details */}
            <div className="space-y-3 pt-2 text-xs font-mono">
              <div className="flex justify-between items-center py-1.5 border-b border-slate-800/80 text-slate-400">
                <span>API Endpoint:</span>
                <a
                  href={`${apiUrl}/api/health`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-1 hover:underline truncate max-w-[220px]"
                >
                  {apiUrl}/api/health
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-slate-800/80 text-slate-400">
                <span>FastAPI Swagger Docs:</span>
                <a
                  href={`${apiUrl}/docs`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-1 hover:underline"
                >
                  {apiUrl}/docs
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-slate-800/80 text-slate-400">
                <span>Last Pinged:</span>
                <span className="text-slate-200">{mounted && lastChecked ? lastChecked : "Awaiting ping..."}</span>
              </div>
              {errorMessage && (
                <div className="p-2.5 rounded bg-rose-950/40 border border-rose-800/40 text-rose-300 text-[11px] leading-relaxed">
                  Error: {errorMessage}. Ensure FastAPI is running on {apiUrl}.
                </div>
              )}
            </div>

            {/* Phase Status Readout */}
            <div className="rounded-lg bg-slate-900/60 p-3.5 border border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-cyan-400" /> Phase 1 Progress
                </span>
                <span className="text-emerald-400 font-semibold">FOUNDATION VERIFIED</span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div className="bg-gradient-to-r from-cyan-500 to-emerald-400 h-full w-1/12 rounded-full"></div>
              </div>
              <div className="flex justify-between text-[11px] font-mono text-slate-500">
                <span>Current: Project Foundation</span>
                <span>Next: Phase 2 Database</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer / System Meta */}
      <footer className="pt-6 border-t border-cyan-900/30 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-slate-400">
        <div className="flex items-center gap-4">
          <span>ARES-TWIN v0.1.0</span>
          <span>•</span>
          <span className="text-slate-400">STACK: Next.js + Tailwind + FastAPI</span>
        </div>
        <div className="flex items-center gap-2">
          <Cpu className="h-3.5 w-3.5 text-cyan-500" />
          <span>ARES MISSION ARCHITECTURE // READY FOR PHASE 2</span>
        </div>
      </footer>
    </main>
  );
}
