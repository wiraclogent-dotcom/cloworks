import { Users } from "lucide-react";
import { Chip } from "./Chip";

/** "Shared" mark for a request with two or more assignees: people icon plus text, never colour alone. */
export function SharedChip({ className }: { className?: string }) {
  return <Chip icon={<Users aria-hidden="true" strokeWidth={1.75} />} className={className}>Shared</Chip>;
}
