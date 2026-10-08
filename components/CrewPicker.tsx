"use client";
import { CREW } from "@/lib/engine";

export default function CrewPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <div className="scroll-x -mx-1 flex gap-2 px-1" role="group" aria-label="Crew member">
      {CREW.map((c) => (
        <button key={c.id} onClick={() => onChange(c.id)} aria-pressed={value === c.id}
          className={`pill shrink-0 px-4 py-2.5 text-sm font-semibold transition-colors ${value === c.id ? "!border-accent bg-accent/15 text-ink" : "text-muted hover:text-ink"}`}>
          {c.name}
        </button>
      ))}
    </div>
  );
}
