"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { MISSION_DAYS } from "./engine";

interface Ctx { day: number; setDay: (d: number) => void }
const MissionCtx = createContext<Ctx>({ day: 120, setDay: () => {} });
export const useMission = () => useContext(MissionCtx);

export function MissionProvider({ children }: { children: ReactNode }) {
  const [day, setDayState] = useState(120);
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem("ares-day"));
      if (Number.isFinite(v) && v > 0 && v <= MISSION_DAYS) setDayState(v);
    } catch {}
  }, []);
  const setDay = (d: number) => {
    const v = Math.max(0, Math.min(MISSION_DAYS, Math.round(d)));
    setDayState(v);
    try { localStorage.setItem("ares-day", String(v)); } catch {}
  };
  return <MissionCtx.Provider value={{ day, setDay }}>{children}</MissionCtx.Provider>;
}
