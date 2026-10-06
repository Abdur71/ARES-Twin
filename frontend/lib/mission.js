"use client";

import { createContext, useContext, useState } from "react";
import { useApi } from "@/lib/api";

const MissionContext = createContext(null);

/** Shared mission clock: every page simulates "today" = `day` (the backend default until the user moves it). */
export function MissionProvider({ children }) {
  const [chosenDay, setDay] = useState(null);
  const { data: mission, error, loading, reload } = useApi(chosenDay == null ? "/mission" : `/mission?day=${chosenDay}`);
  const day = chosenDay ?? mission?.current_day ?? null;

  return (
    <MissionContext.Provider value={{ day, setDay, mission, error, loading, reload }}>
      {children}
    </MissionContext.Provider>
  );
}

export function useMission() {
  return useContext(MissionContext);
}
