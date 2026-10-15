/**
 * The SVG lenses behind the glass utilities (globals.css), rendered once in the root layout.
 * #liquid-glass (`liquid-glass`): fractal noise, softened, displaces the backdrop, then a light blur. Rebuilt from
 * designali-in/liquid-glass-button (21st.dev).
 * #glass-blur (<LiquidGlassCard> bend layer): very low-frequency noise bends the blurred backdrop in long slow waves. From the
 * LiquidGlassCard of liquid-weather-glass (21st.dev).
 */
export function LiquidGlassFilter() {
  return (
    <svg aria-hidden="true" focusable="false" width="0" height="0" className="pointer-events-none absolute">
      <defs>
        <filter id="liquid-glass" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.05 0.05" numOctaves={1} seed={1} result="turbulence" />
          <feGaussianBlur in="turbulence" stdDeviation={2} result="blurredNoise" />
          <feDisplacementMap in="SourceGraphic" in2="blurredNoise" scale={70} xChannelSelector="R" yChannelSelector="B" result="displaced" />
          <feGaussianBlur in="displaced" stdDeviation={4} result="finalBlur" />
          <feComposite in="finalBlur" in2="finalBlur" operator="over" />
        </filter>
        <filter id="glass-blur" x="0" y="0" width="100%" height="100%" filterUnits="objectBoundingBox">
          <feTurbulence type="fractalNoise" baseFrequency="0.003 0.007" numOctaves={1} result="turbulence" />
          <feDisplacementMap in="SourceGraphic" in2="turbulence" scale={200} xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
  );
}
