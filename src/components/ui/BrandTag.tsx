import { Badge } from "@/components/shadcn/badge";
import { brandTone } from "@/lib/palette";

/** Brand tag: Clogent and Bubble Wash have their own colours, every other brand is neutral. */
export function BrandTag({ name, className }: { name: string; className?: string }) {
  return <Badge tone={brandTone(name)} className={className}>{name}</Badge>;
}
