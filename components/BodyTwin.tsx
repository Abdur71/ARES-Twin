import { statusColor, type Status } from "@/lib/engine";

export interface BodyProps {
  bone: { score: number; loss: number };
  muscle: { score: number; loss: number };
  cardio: { score: number; loss: number };
}
const tone = (s: number): string => statusColor[(s >= 0.7 ? "GREEN" : s >= 0.4 ? "AMBER" : "RED") as Status];
const p = (x: number) => `${(x * 100).toFixed(1)}%`;

/** Vector digital-twin: a body schematic whose regions take the colour of each sub-score. */
export default function BodyTwin({ bone, muscle, cardio }: BodyProps) {
  const cb = tone(bone.score), cm = tone(muscle.score), cc = tone(cardio.score);
  return (
    <svg viewBox="-40 0 500 380" className="mx-auto w-full max-w-lg" role="img" aria-label="Body twin: hip bone, leg muscle and heart fitness status">
      <defs>
        <linearGradient id="skin" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#2a2e3a" /><stop offset="1" stopColor="#1b1e26" /></linearGradient>
        <filter id="soft"><feGaussianBlur stdDeviation="6" /></filter>
      </defs>
      <g transform="translate(210 14)">
        {/* body silhouette */}
        <g fill="url(#skin)" stroke="rgba(255,255,255,.14)" strokeWidth="1.2">
          <circle cx="0" cy="26" r="24" />
          <rect x="-12" y="46" width="24" height="16" rx="6" />
          <path d="M-46 66 Q-46 58 -34 58 H34 Q46 58 46 66 V150 Q46 168 30 170 H-30 Q-46 168 -46 150Z" />
          <rect x="-76" y="62" width="26" height="118" rx="13" transform="rotate(8 -63 62)" />
          <rect x="50" y="62" width="26" height="118" rx="13" transform="rotate(-8 63 62)" />
          <rect x="-42" y="160" width="40" height="190" rx="19" />
          <rect x="2" y="160" width="40" height="190" rx="19" />
        </g>
        {/* muscle: thighs + calves */}
        <g fill={cm} opacity=".9">
          <rect x="-38" y="190" width="32" height="70" rx="15" />
          <rect x="6" y="190" width="32" height="70" rx="15" />
          <rect x="-36" y="276" width="28" height="62" rx="13" opacity=".7" />
          <rect x="8" y="276" width="28" height="62" rx="13" opacity=".7" />
        </g>
        {/* bone: pelvis / hip */}
        <g>
          <path d="M-34 150 Q0 188 34 150 L28 176 Q0 200 -28 176Z" fill={cb} />
          <circle cx="-22" cy="178" r="9" fill={cb} /><circle cx="22" cy="178" r="9" fill={cb} />
          <circle cx="-22" cy="178" r="14" fill="none" stroke={cb} strokeOpacity=".5" />
          <circle cx="22" cy="178" r="14" fill="none" stroke={cb} strokeOpacity=".5" />
        </g>
        {/* heart */}
        <g transform="translate(14 98)">
          <circle r="12" fill={cc} filter="url(#soft)" opacity=".8" />
          <circle r="14" fill="none" stroke={cc} strokeWidth="2" className="pulse-ring" />
          <path d="M0 9 C-14 -1 -10 -12 0 -5 C10 -12 14 -1 0 9Z" fill={cc} />
        </g>
        {/* callouts */}
        <g fontSize="12" fontWeight="700" fill="#f4f5f7" fontFamily="var(--font-manrope)">
          <path d="M26 98 H112 L132 78" fill="none" stroke={cc} strokeWidth="1.4" /><circle cx="26" cy="98" r="2.5" fill={cc} />
          <text x="138" y="76">Heart fitness</text>
          <text x="138" y="92" fill={cc} className="num">VO2 loss {p(cardio.loss)}</text>
          <path d="M42 178 H112 L132 196" fill="none" stroke={cb} strokeWidth="1.4" /><circle cx="42" cy="178" r="2.5" fill={cb} />
          <text x="138" y="200">Hip bone</text>
          <text x="138" y="216" fill={cb} className="num">Density loss {p(bone.loss)}</text>
          <path d="M-38 232 H-112 L-132 250" fill="none" stroke={cm} strokeWidth="1.4" transform="translate(0 0)" /><circle cx="-38" cy="232" r="2.5" fill={cm} />
          <text x="-138" y="254" textAnchor="end">Leg muscle</text>
          <text x="-138" y="270" textAnchor="end" fill={cm} className="num">Volume loss {p(muscle.loss)}</text>
        </g>
      </g>
    </svg>
  );
}
