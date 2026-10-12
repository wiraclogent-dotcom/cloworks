import { Clapperboard, Video } from "lucide-react";
import { Chip } from "./Chip";

/** "Needs motion" mark: clapperboard icon plus text, never colour alone. `video` marks a Video request instead. */
export function NeedsMotionChip({ video = false, className }: { video?: boolean; className?: string }) {
  if (video) return <Chip tone="needs-motion" icon={<Video aria-hidden="true" strokeWidth={1.75} />} className={className}>Video</Chip>;
  return <Chip tone="needs-motion" icon={<Clapperboard aria-hidden="true" strokeWidth={1.75} />} className={className}>Needs motion</Chip>;
}
