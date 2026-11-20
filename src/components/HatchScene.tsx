export function HatchScene({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 250 250" className={className} aria-hidden="true">
      <circle
        cx="125"
        cy="125"
        r="120"
        fill="var(--coo-sky)"
        stroke="var(--coo-ink)"
        strokeWidth="3"
      />
      <path
        d="M150 62 q-6 -2 -5 -8 q0 -8 10 -8 q5 -7 15 -4 q10 -3 12 6 q10 0 10 8 q0 6 -8 6 z"
        fill="var(--coo-card)"
        stroke="var(--coo-ink)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M22 196 Q125 176 228 196 Q200 238 125 244 Q50 238 22 196 Z"
        fill="var(--coo-mint)"
        stroke="var(--coo-ink)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <g
        stroke="var(--coo-ink)"
        strokeWidth="2.5"
        strokeLinejoin="round"
        fill="var(--coo-card)"
      >
        <path
          d="M34 196 l7 -9 l7 9 l7 -9 l7 9 l7 -9 l7 9 q-3 20 -21 20 q-18 0 -21 -20 z"
          transform="rotate(-14 55 205)"
        />
        <path
          d="M176 200 l7 -9 l7 9 l7 -9 l7 9 l7 -9 l7 9 q-3 20 -21 20 q-18 0 -21 -20 z"
          transform="rotate(16 197 209)"
        />
      </g>
    </svg>
  );
}
