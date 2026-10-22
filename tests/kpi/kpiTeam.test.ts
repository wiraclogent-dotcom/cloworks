import { describe, it, expect } from "vitest";
import { MEASURE_LABEL, TEAM_LABEL, measureOfBasis, measureOfTeam, resolveTeam, teamOfJobRole } from "@/lib/kpi/team";
import { parseTeamParam } from "@/app/(app)/dashboard/params";

describe("Team KPI team rule", () => {
  it("a social media job role is the social team, everything else creative", () => {
    expect(teamOfJobRole("SOCIAL_MEDIA")).toBe("social");
    expect(teamOfJobRole("DESIGNER")).toBe("creative");
    expect(teamOfJobRole("OTHER")).toBe("creative");
  });

  it("only an admin may pick the team; everyone else gets their own", () => {
    expect(resolveTeam({ appRole: "ADMIN", jobRole: "DESIGNER" }, "social")).toBe("social");
    expect(resolveTeam({ appRole: "ADMIN", jobRole: "DESIGNER" }, undefined)).toBe("creative");
    expect(resolveTeam({ appRole: "LEAD", jobRole: "DESIGNER" }, "social")).toBe("creative");
    expect(resolveTeam({ appRole: "REQUESTER", jobRole: "SOCIAL_MEDIA" }, "creative")).toBe("social");
  });

  it("parses only the two team values", () => {
    expect(parseTeamParam("social")).toBe("social");
    expect(parseTeamParam(["creative", "social"])).toBe("creative");
    expect(parseTeamParam("Social")).toBeUndefined();
    expect(parseTeamParam(undefined)).toBeUndefined();
  });

  it("measures the social team and a social media basis in posts", () => {
    expect(measureOfTeam("social")).toBe("posts");
    expect(measureOfTeam("creative")).toBe("requests");
    expect(measureOfBasis("SOCIAL_MEDIA")).toBe("posts");
    expect(measureOfBasis("OTHER")).toBe("requests");
    expect(MEASURE_LABEL.posts.section).toBe("Content Plan");
    expect(MEASURE_LABEL.posts.done).toBe("Posts approved");
    expect(TEAM_LABEL).toEqual({ creative: "Creative", social: "Social media" });
  });
});
