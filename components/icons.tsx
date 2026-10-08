import type { SVGProps } from "react";
const base = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
type P = SVGProps<SVGSVGElement>;
export const IconMission = (p: P) => (<svg {...base} {...p}><circle cx="12" cy="12" r="4" /><ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(-24 12 12)" /></svg>);
export const IconWhatIf = (p: P) => (<svg {...base} {...p}><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></svg>);
export const IconTarget = (p: P) => (<svg {...base} {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /></svg>);
export const IconSun = (p: P) => (<svg {...base} {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></svg>);
export const IconBook = (p: P) => (<svg {...base} {...p}><path d="M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4V4z" /><path d="M5 16a4 4 0 0 1 4-4h10" /></svg>);
export const IconArrow = (p: P) => (<svg {...base} {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>);
export const IconBack = (p: P) => (<svg {...base} {...p}><path d="M19 12H5M11 6l-6 6 6 6" /></svg>);
export const IconBolt = (p: P) => (<svg {...base} {...p}><path d="M13 2 4 14h7l-1 8 9-12h-7z" /></svg>);
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff7a55" /><stop offset="1" stopColor="#d93a1c" /></linearGradient></defs>
      <circle cx="16" cy="16" r="8" fill="url(#lg)" />
      <ellipse cx="16" cy="16" rx="14" ry="5.5" transform="rotate(-24 16 16)" stroke="#f4f5f7" strokeOpacity=".85" strokeWidth="1.4" />
      <circle cx="26.6" cy="10.3" r="2" fill="#f4f5f7" />
    </svg>
  );
}
