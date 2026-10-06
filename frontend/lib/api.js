"use client";

import { useCallback, useEffect, useState } from "react";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export async function api(path, { method = "GET", body, signal } = {}) {
  const res = await fetch(`${API_URL}/api${path}`, {
    method,
    signal,
    cache: "no-store",
    headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = data?.detail;
    const msg = Array.isArray(detail) ? detail.map((d) => d.msg).join("; ") : detail || res.statusText;
    throw new Error(`HTTP ${res.status}: ${msg}`);
  }
  return data;
}

/**
 * GET `path` whenever it changes (pass null to skip). The previous data stays
 * visible while a new request is in flight; `loading` is derived, not stored.
 */
export function useApi(path) {
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const key = path ? `${path}#${tick}` : null;
  const [state, setState] = useState({ key: null, data: null, error: null });

  useEffect(() => {
    if (!key) return undefined;
    const ctrl = new AbortController();
    api(path, { signal: ctrl.signal })
      .then((data) => setState({ key, data, error: null }))
      .catch((error) => {
        if (error.name !== "AbortError") setState((s) => ({ ...s, key, error }));
      });
    return () => ctrl.abort();
  }, [key, path]);

  return {
    data: state.data,
    error: state.key === key ? state.error : null,
    loading: Boolean(key) && state.key !== key,
    reload,
  };
}
