import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";
import { buttonClass } from "./ui/Button";
import { EmptyState } from "./ui/EmptyState";

/** "Page not found" as the kit EmptyState (h1, icon, one sentence, back to Requests). Used inside and outside the shell. */
export function NotFoundPanel({ className }: { className?: string }) {
  return (
    <EmptyState titleAs="h1" icon={<SearchX />} title="Page not found" className={className}
      description="We could not find that page. It may have been moved, or the link is wrong."
      action={<Link href="/requests" className={buttonClass({ variant: "primary" })}><ArrowLeft aria-hidden="true" />Back to requests</Link>} />
  );
}
