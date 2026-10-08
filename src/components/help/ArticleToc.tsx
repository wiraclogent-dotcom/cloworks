import type { TocEntry } from "@/lib/help/toc";

/** "On this page" links to the article's ## and ### headings. Renders nothing when the guide has no headings. */
export function ArticleToc({ entries }: { entries: TocEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <nav aria-label="On this page" className="text-sm">
      <p className="mb-2 font-semibold text-foreground">On this page</p>
      <ul className="space-y-1">
        {entries.map((e) => (
          <li key={e.id} className={e.level === 3 ? "pl-3" : undefined}>
            <a href={`#${e.id}`} className="text-foreground-secondary hover:text-foreground">{e.text}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
