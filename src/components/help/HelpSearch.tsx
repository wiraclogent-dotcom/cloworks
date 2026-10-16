"use client";
import { SearchX } from "lucide-react";

import Link from "next/link";
import { useState } from "react";
import type { Article, Section } from "@/lib/help/content";
import { searchArticles } from "@/lib/help/search";
import { Input } from "@/components/shadcn/input";
import { Card, CardHeader, CardTitle } from "@/components/shadcn/card";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * Search box plus the guide list. `sections` is already filtered to what the viewer may read on the server, so
 * this component never sees a hidden guide.
 */
export function HelpSearch({ sections }: { sections: { section: Section; articles: Article[] }[] }) {
  const [query, setQuery] = useState("");
  const all = sections.flatMap((s) => s.articles);
  const matches = searchArticles(all, query);
  const searching = query.trim() !== "";

  return (
    <div className="space-y-4">
      <Input
        type="search"
        aria-label="Search help"
        placeholder="Search guides"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {searching ? (
        matches.length === 0 ? (
          <EmptyState icon={<SearchX />} title={`No guides match ‘${query.trim()}’`} />
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {matches.map((a) => (
                <li key={a.slug} className="py-2">
                  <Link href={`/help/${a.slug}`} className="font-medium text-foreground hover:underline">{a.title}</Link>
                  <span className="ml-2 text-sm text-muted-foreground">{a.section}</span>
                </li>
              ))}
            </ul>
          </Card>
        )
      ) : (
        sections.map(({ section, articles }) => (
          <Card key={section}>
            <CardHeader>
              <CardTitle>{section}</CardTitle>
            </CardHeader>
            <ul className="divide-y divide-border">
              {articles.map((a) => (
                <li key={a.slug} className="py-2">
                  <Link href={`/help/${a.slug}`} className="font-medium text-foreground hover:underline">{a.title}</Link>
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}
