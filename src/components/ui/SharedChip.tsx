import { Users } from "lucide-react";
import { Badge } from "@/components/shadcn/badge";

/** "Shared" mark for a request with two or more assignees: people icon plus text, never colour alone. */
export function SharedChip({ className }: { className?: string }) {
  return <Badge className={className}><Users aria-hidden="true" strokeWidth={1.75} />Shared</Badge>;
}
