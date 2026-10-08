"use client";
import { useEffect, useState } from "react";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Pings the FastAPI backend. The UI runs on the built-in engine either way. */
export function useBackend(): "checking" | "live" | "offline" {
  const [s, setS] = useState<"checking" | "live" | "offline">("checking");
  useEffect(() => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 2500);
    fetch(`${API_URL}/api/health`, { signal: ctl.signal })
      .then((r) => setS(r.ok ? "live" : "offline"))
      .catch(() => setS("offline"))
      .finally(() => clearTimeout(t));
    return () => { ctl.abort(); clearTimeout(t); };
  }, []);
  return s;
}
