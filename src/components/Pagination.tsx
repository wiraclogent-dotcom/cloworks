import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonClass } from "./ui/Button";

const link = buttonClass({ variant: "ghost", size: "sm" });
const off = buttonClass({ variant: "ghost", size: "sm", className: "pointer-events-none opacity-55" });

/**
 * Server component: plain links, so paging works without JS. `hrefFor(n)` builds the URL (other params preserved by
 * the caller). Styled as the table card's footer: range text left, "Page X of Y" centre, Previous / Next right.
 */
export function Pagination({ text, page, pageCount, hrefFor }: { text: string; page: number; pageCount: number; hrefFor: (page: number) => string }) {
  return (
    <nav aria-label="Pagination" className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 border-t border-border bg-card px-3 py-2 text-[13px] text-foreground-secondary sm:grid-cols-[1fr_auto_1fr]">
      <p className="tabular-nums" aria-live="polite">{text}</p>
      {pageCount > 1 && (
        <>
          <span className="order-last col-span-2 text-center tabular-nums sm:order-none sm:col-span-1">Page {page} of {pageCount}</span>
          <div className="flex items-center justify-end gap-1">
            {page > 1 ? <Link href={hrefFor(page - 1)} rel="prev" className={link}><ChevronLeft aria-hidden="true" strokeWidth={1.75} />Previous</Link> : <span aria-disabled="true" className={off}><ChevronLeft aria-hidden="true" strokeWidth={1.75} />Previous</span>}
            {page < pageCount ? <Link href={hrefFor(page + 1)} rel="next" className={link}>Next<ChevronRight aria-hidden="true" strokeWidth={1.75} /></Link> : <span aria-disabled="true" className={off}>Next<ChevronRight aria-hidden="true" strokeWidth={1.75} /></span>}
          </div>
        </>
      )}
    </nav>
  );
}
