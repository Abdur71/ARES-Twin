"use client";
import dynamic from "next/dynamic";

const Fallback = ({ label }: { label: string }) => (
  <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-muted" role="status">{label}</div>
);

export const HeroScene = dynamic(() => import("./three/HeroScene"), { ssr: false, loading: () => <Fallback label="Loading 3D scene" /> });
export const TransitScene = dynamic(() => import("./three/TransitScene"), { ssr: false, loading: () => <Fallback label="Loading transit simulation" /> });
export const AstronautViewer = dynamic(() => import("./three/HeroScene").then((m) => m.AstronautViewer), { ssr: false, loading: () => <Fallback label="Loading 3D model" /> });
