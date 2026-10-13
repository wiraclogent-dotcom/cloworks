import { SegmentedControl } from "@/components/ui/SegmentedControl";

export type KpiView = "requests" | "projects";

/**
 * Requests | Projects switch for the KPI pages: two links on `base`. Every param in `params` is kept (the first value
 * of repeated ones) except `view`, which is set to `projects` for Projects and cleared for Requests (the default).
 * A page whose default can be Projects (My KPI) passes `explicitRequests` so the Requests link says `view=requests`
 * and does not bounce back to the default.
 */
export function KpiViewToggle({ view, base, params, explicitRequests = false }: {
  view: KpiView; base: string; params: Record<string, string | string[] | undefined>; explicitRequests?: boolean;
}) {
  const href = (target: KpiView) => {
    const sp = new URLSearchParams();
    for (const [k, raw] of Object.entries(params)) {
      const v = Array.isArray(raw) ? raw[0] : raw;
      if (k !== "view" && v !== undefined && v !== "") sp.set(k, v);
    }
    if (target === "projects" || explicitRequests) sp.set("view", target);
    const qs = sp.toString();
    return qs ? `${base}?${qs}` : base;
  };
  return (
    <SegmentedControl label="View" value={view}
      items={[{ value: "requests", label: "Requests", href: href("requests") }, { value: "projects", label: "Projects", href: href("projects") }]} />
  );
}
