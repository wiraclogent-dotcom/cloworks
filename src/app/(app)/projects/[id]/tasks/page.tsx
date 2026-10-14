import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Project details" };

/** The all-details table was folded into the project page's item list. Old links and bookmarks land there. */
export default async function ProjectTasksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/projects/${id}`);
}
