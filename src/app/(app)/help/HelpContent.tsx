import { requireUserOrRedirect } from "@/lib/session";
import { HelpSearch } from "@/components/help/HelpSearch";
import { buildIndexSections, getArticles } from "./help-data";

/** The per-user guide list. Async, so it renders inside the page's Suspense boundary. */
export async function HelpContent() {
  const user = await requireUserOrRedirect();
  return <HelpSearch sections={buildIndexSections(getArticles(), user.appRole)} />;
}
