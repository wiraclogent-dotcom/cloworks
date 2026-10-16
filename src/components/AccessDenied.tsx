import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { EmptyState } from "./ui/EmptyState";
import { Button } from "@/components/shadcn/button";

/**
 * 403 panel shown INSTEAD of a page's data (never alongside it): lock icon, the page's h1 "403 · Access denied",
 * one sentence, and a way back. Announced as an alert, as before the redesign.
 */
export function AccessDenied({ description, backHref = "/requests", backLabel = "Back to requests" }: {
  description: string; backHref?: string; backLabel?: string;
}) {
  return (
    <EmptyState role="alert" titleAs="h1" icon={<Lock />} title="403 · Access denied" description={description} className="mx-auto mt-6 max-w-xl"
      action={<Button asChild variant="outline"><Link href={backHref}><ArrowLeft aria-hidden="true" />{backLabel}</Link></Button>} />
  );
}
