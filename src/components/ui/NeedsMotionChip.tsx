import { Clapperboard } from "lucide-react";
import { Chip } from "./Chip";

/** "Needs motion" mark: clapperboard icon plus text, never colour alone. */
export function NeedsMotionChip({ className }: { className?: string }) {
  return <Chip tone="needs-motion" icon={<Clapperboard aria-hidden="true" strokeWidth={1.75} />} className={className}>Needs motion</Chip>;
}
