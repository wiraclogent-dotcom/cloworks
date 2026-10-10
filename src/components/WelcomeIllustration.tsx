import type { DayPeriod } from "@/lib/todayOverview";

/** Sky and sun or moon per time of day. Token colours only, so both themes work; the evening sky is brand Deep Blue in both. */
const SCENE: Record<DayPeriod, { sky: string; glow: string; glowOpacity: number; orb: string; orbX: number; orbY: number }> = {
  morning: { sky: "var(--accent)", glow: "var(--status-due-soon-tint)", glowOpacity: 0.8, orb: "var(--status-due-soon-accent)", orbX: 196, orbY: 34 },
  afternoon: { sky: "var(--status-due-soon-tint)", glow: "var(--surface)", glowOpacity: 0.7, orb: "var(--status-due-soon-accent)", orbX: 130, orbY: 26 },
  evening: { sky: "var(--brand-deep-blue)", glow: "var(--brand-white)", glowOpacity: 0.12, orb: "var(--brand-white)", orbX: 196, orbY: 32 },
};

const STARS: [number, number, number][] = [[30, 22, 1.4], [62, 40, 1], [96, 16, 1.2], [128, 30, 0.9], [158, 48, 1.1], [222, 58, 0.9]];

/**
 * Decorative scene for the Requests welcome card: the sky for the time of day over a tiny three-column board
 * (Requested, On progress, Done) with the Cloworks cloud drifting above it.
 */
export function WelcomeIllustration({ period }: { period: DayPeriod }) {
  const s = SCENE[period];
  const evening = period === "evening";
  return (
    <svg viewBox="0 0 240 128" aria-hidden="true" focusable="false" className="h-full w-full">
      <defs>
        <clipPath id="welcome-sky"><rect width="240" height="128" rx="14" /></clipPath>
      </defs>
      <g clipPath="url(#welcome-sky)">
        <rect width="240" height="128" style={{ fill: s.sky }} />
        {/* Sun or moon with a soft halo */}
        <circle cx={s.orbX} cy={s.orbY} r="30" style={{ fill: s.glow, opacity: s.glowOpacity }} />
        <circle cx={s.orbX} cy={s.orbY} r="15" style={{ fill: s.orb }} />
        {evening ? (
          <>
            {/* Crescent: cut the moon with a sky-coloured disc */}
            <circle cx={s.orbX + 7} cy={s.orbY - 5} r="13" style={{ fill: s.sky }} />
            {STARS.map(([x, y, r]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={r} style={{ fill: "var(--brand-white)", opacity: 0.85 }} />)}
          </>
        ) : null}
        {/* The Cloworks cloud */}
        <g style={{ fill: evening ? "var(--brand-aqua)" : "var(--surface)", opacity: evening ? 0.35 : 0.95 }}>
          <circle cx="62" cy="40" r="9" />
          <circle cx="74" cy="34" r="12" />
          <circle cx="86" cy="41" r="8" />
          <rect x="53" y="38" width="42" height="11" rx="5.5" />
        </g>
        {/* Desk */}
        <rect x="0" y="104" width="240" height="24" style={{ fill: evening ? "var(--brand-deep-blue-night)" : "var(--surface-muted)" }} />
        {/* Mini board: three columns, cards tinted by status */}
        {[
          { x: 40, cards: ["var(--status-requested-accent)", "var(--status-requested-accent)"] },
          { x: 98, cards: ["var(--status-in-progress-accent)"] },
          { x: 156, cards: ["var(--status-done-accent)", "var(--status-done-accent)", "var(--status-done-accent)"] },
        ].map((col) => (
          <g key={col.x}>
            <rect x={col.x} y="62" width="46" height="54" rx="6" style={{ fill: "var(--surface)", stroke: "var(--border)" }} />
            {col.cards.map((c, i) => (
              <g key={i}>
                <rect x={col.x + 5} y={68 + i * 14} width="36" height="10" rx="3" style={{ fill: "var(--surface-muted)" }} />
                <rect x={col.x + 5} y={68 + i * 14} width="3" height="10" rx="1.5" style={{ fill: c }} />
                <rect x={col.x + 12} y={71.5 + i * 14} width={i % 2 ? 16 : 22} height="3" rx="1.5" style={{ fill: "var(--border-strong)" }} />
              </g>
            ))}
          </g>
        ))}
      </g>
    </svg>
  );
}
