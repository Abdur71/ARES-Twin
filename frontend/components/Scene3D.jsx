"use client";

import dynamic from "next/dynamic";

const Fallback = ({ label }) => (
  <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-400" role="status">
    <div className="flex items-center gap-2">
      <div className="h-3 w-3 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
      <span>{label}</span>
    </div>
  </div>
);

export const HeroScene = dynamic(() => import("./three/HeroScene"), {
  ssr: false,
  loading: () => <Fallback label="Loading 3D scene…" />,
});

export const TransitScene = dynamic(() => import("./three/TransitScene"), {
  ssr: false,
  loading: () => <Fallback label="Loading transit simulation…" />,
});

export const AstronautViewer = dynamic(() => import("./three/HeroScene").then((m) => m.AstronautViewer), {
  ssr: false,
  loading: () => <Fallback label="Loading 3D model…" />,
});
