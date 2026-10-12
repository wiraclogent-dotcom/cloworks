import type { CSSProperties } from "react";

/**
 * A whole number that counts up from 0 on arrival. CSS only (an animated @property integer shown through a
 * counter, see `.count-up` in globals.css): no JS, no hydration flicker. The real number is in the DOM as
 * screen-reader text, so assistive tech, copy and tests read the value itself. Non-integers render plainly.
 */
export function CountUp({ value }: { value: number }) {
  if (!Number.isInteger(value) || value < 0) return <>{value}</>;
  return (
    <>
      <span aria-hidden="true" className="count-up" style={{ "--to": value } as CSSProperties} />
      <span className="sr-only">{value}</span>
    </>
  );
}
