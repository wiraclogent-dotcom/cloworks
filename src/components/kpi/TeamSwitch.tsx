import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { kpiHref } from "@/lib/kpi/href";
import { KPI_TEAMS, TEAM_LABEL, type KpiTeam } from "@/lib/kpi/team";

/** Admins' Creative / Social media switch on Team KPI (links); `keep` carries the month and year so a switch keeps them. */
export function TeamSwitch({ current, keep }: { current: KpiTeam; keep: Record<string, string | undefined> }) {
  return (
    <SegmentedControl label="Team" value={current}
      items={KPI_TEAMS.map((team) => ({ value: team, label: TEAM_LABEL[team], href: kpiHref("/dashboard/team", { ...keep, team }) }))} />
  );
}
