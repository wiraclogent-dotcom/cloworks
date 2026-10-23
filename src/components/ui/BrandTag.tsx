"use client";

import { Badge } from "@/components/shadcn/badge";
import { useBrandTone } from "./brandDirectory";

/** Brand tag in the brand's chosen colour (Settings › Lists); outside the app, Clogent and Bubble Wash keep theirs, others grey. */
export function BrandTag({ name, className }: { name: string; className?: string }) {
  return <Badge tone={useBrandTone(name)} className={className}>{name}</Badge>;
}
