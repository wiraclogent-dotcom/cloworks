/** Brand and status accents for the confetti pieces (CSS variables, so they follow the theme). */
const COLORS = ["var(--brand-aqua)", "var(--brand-deep-blue)", "var(--chart-cat-4)", "var(--chart-cat-2)", "var(--status-first-look-accent)"];

/**
 * A small CSS confetti burst (no library): ~28 pieces fly out from a point and fade, then remove themselves.
 * Defaults to the centre of the viewport. Does nothing under prefers-reduced-motion or outside the browser.
 */
export function celebrate(origin?: { x: number; y: number }) {
  if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? window.innerHeight / 2;
  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  layer.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:0;height:0;pointer-events:none;z-index:100`;
  for (let i = 0; i < 28; i++) {
    const piece = document.createElement("span");
    const angle = (Math.PI * 2 * i) / 28 + Math.random() * 0.4;
    const dist = 70 + Math.random() * 90;
    const round = i % 3 === 0;
    piece.className = "confetti-piece";
    piece.style.cssText =
      `position:absolute;left:-4px;top:-4px;width:${round ? 8 : 6}px;height:${round ? 8 : 12}px;` +
      `border-radius:${round ? "9999px" : "2px"};background:${COLORS[i % COLORS.length]};` +
      `--dx:${Math.cos(angle) * dist}px;--dy:${Math.sin(angle) * dist + 40}px;--rot:${Math.random() * 540 - 270}deg;` +
      `animation-delay:${Math.random() * 60}ms`;
    layer.appendChild(piece);
  }
  document.body.appendChild(layer);
  window.setTimeout(() => layer.remove(), 1200);
}

/** Viewport centre of an element (where a burst should start), or undefined when it is gone. */
export function centreOf(el: Element | null | undefined): { x: number; y: number } | undefined {
  if (!el) return undefined;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
