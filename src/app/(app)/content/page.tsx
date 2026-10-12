import type { Metadata } from "next";
import { Suspense } from "react";
import { requireScope } from "@/lib/session";
import { loadContentPlan } from "@/lib/content/view";
import { parseTab } from "@/lib/content/params";
import { ContentPlanLayout } from "@/components/content/ContentPlanLayout";
import { ProjectsSkeleton } from "@/components/PageSkeletons";
import { PageHeader } from "@/components/ui/PageHeader";

/** Tab title: "Content Plan · Cloworks" (root layout template). Static: no per-user data in metadata. */
export const metadata: Metadata = { title: "Content Plan" };

const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

async function ContentPlanContent({ searchParams }: { searchParams: PageProps<"/content">["searchParams"] }) {
  const { user, db } = await requireScope();
  const sp = await searchParams;
  // A missing tab stays undefined so an open post's own surface decides it.
  const view = await loadContentPlan(db, user, {
    channelId: one(sp.channel), tab: one(sp.tab) ? parseTab(sp.tab) : undefined, postId: one(sp.post),
  });
  const brands = view.can.manageChannels
    ? await db.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
    : [];
  return (
    <>
      <PageHeader breadcrumb={[{ label: "Tools" }, { label: "Content Plan" }]} title="Content Plan"
        description="Plan each brand's Instagram feed, reels and stories." />
      {/* The post side panel (view.postId) plugs into `panel`. */}
      <ContentPlanLayout view={view} brands={brands} />
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
