import Link from "next/link";

const link = "rounded-md border border-border px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-ring";
const off = "rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground opacity-60";

/** Server component: plain links, so paging works without JS. `hrefFor(n)` builds the URL (other params preserved by the caller). */
export function Pagination({ text, page, pageCount, hrefFor }: { text: string; page: number; pageCount: number; hrefFor: (page: number) => string }) {
  return (
    <nav aria-label="Pagination" className="mt-4 flex flex-wrap items-center gap-3">
      <p className="text-sm" aria-live="polite">{text}</p>
      {pageCount > 1 && (
        <div className="ml-auto flex items-center gap-2">
          {page > 1 ? <Link href={hrefFor(page - 1)} rel="prev" className={link}>Previous</Link> : <span aria-disabled="true" className={off}>Previous</span>}
          <span className="text-sm">Page {page} of {pageCount}</span>
          {page < pageCount ? <Link href={hrefFor(page + 1)} rel="next" className={link}>Next</Link> : <span aria-disabled="true" className={off}>Next</span>}
        </div>
      )}
    </nav>
  );
}
