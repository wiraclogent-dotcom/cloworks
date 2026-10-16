import type { Metadata } from "next";
import { Suspense } from "react";
import { requireScope } from "@/lib/session";
import { loadContentPlan } from "@/lib/content/view";
import { loadPostPanel } from "@/lib/content/panelView";
import { parseTab, planHref } from "@/lib/content/params";
import { ContentPlanLayout } from "@/components/content/ContentPlanLayout";
import { PostPanel } from "@/components/content/PostPanel";
import { ProjectsSkeleton } from "@/components/PageSkeletons";
import { PageHeader } from "@/components/ui/PageHeader";

/** Tab title: "Content Plan · Clowork" (root layout template). Static: no per-user data in metadata. */
export const metadata: Metadata = { title: "Content Plan" };

const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

async function ContentPlanContent({ searchParams }: { searchParams: PageProps<"/content">["searchParams"] }) {
  const { user, db } = await requireScope();
  const sp = await searchParams;
  // A missing tab stays undefined so an open post's own surface decides it.
  const view = await loadContentPlan(db, user, {
    channelId: one(sp.channel), tab: one(sp.tab) ? parseTab(sp.tab) : undefined, postId: one(sp.post),
  });
  const [brands, panel] = await Promise.all([
    view.can.manageChannels ? db.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }) : [],
    view.postId ? loadPostPanel(db, user, view.postId) : null,
  ]);
  return (
    <>
      <PageHeader breadcrumb={[{ label: "Tools" }, { label: "Content Plan" }]} title="Content Plan"
        description="Plan each brand's Instagram feed, reels and stories." />
      {/* Keyed by post so a different post starts a fresh editor (its autosave state is per post). */}
      <ContentPlanLayout view={view} brands={brands} panel={panel ? (
        <PostPanel key={panel.post.id} view={panel} closeHref={planHref({ channel: view.channel?.id, tab: view.tab })} />
      ) : undefined} />
    </>
  );
}

export default function ContentPlanPage(props: PageProps<"/content">) {
  return (
    <div>
      <Suspense fallback={<ProjectsSkeleton />}>
        <ContentPlanContent searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
