"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { isHttpUrl } from "@/lib/fieldSchema";
import { isServerPath } from "@/lib/fileLocation";
import { cn, focusRing } from "./cn";

/**
 * A stored file/folder location. Web links open in a new tab; file-server paths (\\192.168.…\share, smb://…) cannot be
 * opened from a web page, so they show as text (`name`, else the path itself) with a button that copies the path.
 * Anything else is plain text.
 */
export function FileLocationLink({ href, name, children, className }: { href: string; name?: string; children: React.ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false);
  if (isHttpUrl(href))
    return <a href={href} target="_blank" rel="noopener noreferrer" className={className}>{children}<span className="sr-only"> (opens in a new tab)</span></a>;
  if (!isServerPath(href)) return <span className="break-all">{children}</span>;

  async function copy() {
    try {
      await navigator.clipboard.writeText(href.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-1.5" title={href}>
      <span className={cn("min-w-0 break-all", !name && "font-mono text-xs")}>{name ?? href}</span>
      <button type="button" onClick={copy} aria-label={copied ? "Path copied" : `Copy server path ${href}`}
        className={cn("inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-link hover:bg-surface-muted", focusRing)}>
        {copied ? <Check aria-hidden="true" strokeWidth={1.75} className="size-3.5" /> : <Copy aria-hidden="true" strokeWidth={1.75} className="size-3.5" />}
        {copied ? "Copied" : "Copy path"}
      </button>
    </span>
  );
}
