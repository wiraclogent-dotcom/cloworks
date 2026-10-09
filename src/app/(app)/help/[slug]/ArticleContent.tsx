import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserOrRedirect } from "@/lib/session";
import { findVisible } from "@/lib/help/access";
import { extractToc } from "@/lib/help/toc";
import { ArticleBody } from "@/components/help/ArticleBody";
import { ArticleToc } from "@/components/help/ArticleToc";
import { PageHeader } from "@/components/ui/PageHeader";
import { getArticles } from "../help-data";

/** One guide the viewer may read; calls notFound for a hidden or unknown slug. Async, so it renders inside Suspense. */
export async function ArticleContent({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUserOrRedirect();
  const found = findVisible(getArticles(), user.appRole, slug);
  if (!found) {
    notFound();
    return null;
  }

  const { article, prev, next } = found;
  return (
    <>
      <PageHeader title={article.title} description={article.section} />
      <div className="grid gap-6 lg:grid-cols-[1fr_200px]">
        <article>
          <ArticleBody body={article.body} />
          <nav aria-label="Guide navigation" className="mt-8 flex justify-between gap-4 border-t border-border pt-4 text-sm">
            {prev ? (
              <Link href={`/help/${prev.slug}`} className="text-foreground hover:underline">
                <span className="block text-xs text-foreground-secondary">Previous</span>
                {prev.title}
              </Link>
            ) : <span />}
            {next ? (
              <Link href={`/help/${next.slug}`} className="ml-auto text-right text-foreground hover:underline">
                <span className="block text-xs text-foreground-secondary">Next</span>
                {next.title}
              </Link>
            ) : null}
          </nav>
        </article>
        <ArticleToc entries={extractToc(article.body)} />
      </div>
    </>
  );
}
