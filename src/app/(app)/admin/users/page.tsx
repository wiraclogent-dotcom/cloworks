import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminSkeleton } from "@/components/PageSkeletons";
import { UsersContent } from "./UsersContent";

/** Tab title: "Admin · Members · Clowork" (root layout template). Static: no per-user data in metadata. */
export const metadata: Metadata = { title: "Admin · Members" };

async function Content({ searchParams }: { searchParams: PageProps<"/admin/users">["searchParams"] }) {
  const { tab, merged } = await searchParams;
  return <UsersContent tab={typeof tab === "string" ? tab : undefined} merged={typeof merged === "string" ? merged.trim() || undefined : undefined} />;
}

export default function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  return (
    <div>
      <Suspense fallback={<AdminSkeleton label="Loading people…" />}>
        <Content searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
