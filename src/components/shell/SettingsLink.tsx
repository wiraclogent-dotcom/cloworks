import Link from "next/link";
import { Settings } from "lucide-react";
import { cn, focusRing } from "../ui/cn";

/** Top-bar gear: the way into Settings (the sidebar no longer lists it). Same size and frame as the other top-bar icons. */
export function SettingsLink() {
  return (
    <Link href="/settings" aria-label="Settings" title="Settings"
      className={cn("inline-flex size-9 items-center justify-center rounded-lg border border-border bg-surface text-foreground-secondary transition-colors duration-150 hover:border-border-strong hover:text-foreground [&_svg]:size-4", focusRing)}>
      <Settings aria-hidden="true" />
    </Link>
  );
}
