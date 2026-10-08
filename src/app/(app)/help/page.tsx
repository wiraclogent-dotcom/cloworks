import type { Metadata } from "next";
import { requireUserOrRedirect } from "@/lib/session";
import { PageHeader } from "@/components/ui/PageHeader";
import { HelpSearch } from "@/components/help/HelpSearch";
import { buildIndexSections, getArticles } from "./help-data";

/** Tab title: "Help · Cloworks" (root layout template). Static: no per-user data in metadata. */
export const metadata: Metadata = { title: "Help" };

export default async function HelpPage() {
  const user = await requireUserOrRedirect();
  const sections = buildIndexSections(getArticles(), user.appRole);

  return (
    <>
      <PageHeader title="Help" description="Short guides for the parts of Cloworks you can use." />
      <HelpSearch sections={sections} />
    </>
  );
}
