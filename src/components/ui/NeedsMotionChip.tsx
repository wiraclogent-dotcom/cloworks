import { Clapperboard, Video } from "lucide-react";
import { Badge } from "@/components/shadcn/badge";

/** "Needs motion" mark: clapperboard icon plus text, never colour alone. `video` marks a Video request instead. */
export function NeedsMotionChip({ video = false, className }: { video?: boolean; className?: string }) {
  if (video) return <Badge tone="needs-motion" className={className}><Video aria-hidden="true" strokeWidth={1.75} />Video</Badge>;
  return <Badge tone="needs-motion" className={className}><Clapperboard aria-hidden="true" strokeWidth={1.75} />Needs motion</Badge>;
}
