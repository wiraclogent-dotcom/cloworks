import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";
import { EmptyState } from "./ui/EmptyState";
import { Button } from "@/components/shadcn/button";

/** "Page not found" as the kit EmptyState (h1, icon, one sentence, back to Requests). Used inside and outside the shell. */
export function NotFoundPanel({ className }: { className?: string }) {
  return (
    <EmptyState titleAs="h1" art="not-found" icon={<SearchX />} title="Page not found" className={className}
      description="We could not find that page. It may have been moved, or the link is wrong."
      action={<Button asChild variant="default"><Link href="/requests"><ArrowLeft aria-hidden="true" />Back to requests</Link></Button>} />
  );
}
