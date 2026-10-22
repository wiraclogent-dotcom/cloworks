import type { AppRole, JobRole } from "@prisma/client";

/**
 * Which team Team KPI shows (spec 2026-10-22): by job role, social media people are the Social media team, everyone
 * else the Creative team. Only an admin may look at the other team. Pure and client-safe.
 */
export type KpiTeam = "creative" | "social";
export const KPI_TEAMS: readonly KpiTeam[] = ["creative", "social"];
export const TEAM_LABEL: Record<KpiTeam, string> = { creative: "Creative", social: "Social media" };

/** What a KPI row counts: requests (designers) or approved Content Plan posts (social media). */
export type KpiMeasure = "requests" | "posts";

export const MEASURE_LABEL: Record<KpiMeasure, { section: string; done: string; summaryDone: string; summaryProgress: string; doneHint: string }> = {
  requests: {
    section: "Requests", done: "Tasks done", summaryDone: "Request tasks done", summaryProgress: "Request target progress",
    doneHint: "Each request counted once, even when several people worked on it.",
  },
  posts: { section: "Content Plan", done: "Posts approved", summaryDone: "Posts approved", summaryProgress: "Post target progress", doneHint: "Each post counted once." },
};

export const teamOfJobRole = (jobRole: JobRole): KpiTeam => (jobRole === "SOCIAL_MEDIA" ? "social" : "creative");

/** An admin's requested team, else the viewer's own. */
export function resolveTeam(viewer: { appRole: AppRole; jobRole: JobRole }, requested: KpiTeam | undefined): KpiTeam {
  return viewer.appRole === "ADMIN" && requested ? requested : teamOfJobRole(viewer.jobRole);
}

export const measureOfTeam = (team: KpiTeam): KpiMeasure => (team === "social" ? "posts" : "requests");
export const measureOfBasis = (basis: JobRole): KpiMeasure => (basis === "SOCIAL_MEDIA" ? "posts" : "requests");
