import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { Tone } from "@/lib/palette";
import { cn } from "./cn";

export type AlertTone = "info" | "success" | "warning" | "danger";
const TONE: Record<AlertTone, Tone> = { info: "in-progress", success: "done", warning: "due-soon", danger: "cancelled" };
const ICON = { info: Info, success: CircleCheck, warning: TriangleAlert, danger: CircleAlert } as const;

/**
 * Inline message: tinted box, icon + text (+ optional title and action). Role defaults to "alert" for danger and
 * "status" otherwise; pass `role={null}` for static text that should not be announced.
 */
export function Alert({ tone = "info", title, children, action, role, id, className }: {
  tone?: AlertTone; title?: ReactNode; children?: ReactNode; action?: ReactNode; role?: "alert" | "status" | null; id?: string; className?: string;
}) {
  const Icon = ICON[tone];
  const r = role === null ? undefined : role ?? (tone === "danger" ? "alert" : "status");
  return (
    <div id={id} role={r} data-tone={TONE[tone]}
      className={cn("flex items-start gap-2.5 rounded-lg border border-tone-accent/40 bg-tone-tint px-3 py-2.5 text-sm text-tone-text", className)}>
      <Icon aria-hidden="true" strokeWidth={1.75} className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
