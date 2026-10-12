import { describe, expect, it } from "vitest";
import type { AppRole, ContentStatus, JobRole } from "@prisma/client";
import { canApproveContent, canDraftContent, canManageChannels, type ContentActor } from "@/lib/content/permissions";
import { canDelete, isEditable, nextStatus } from "@/lib/content/workflow";

const APP_ROLES: AppRole[] = ["REQUESTER", "CREATIVE", "LEAD", "ADMIN"];
const JOB_ROLES: JobRole[] = ["DESIGNER", "SOCIAL_MEDIA", "OTHER"];
const STATUSES: ContentStatus[] = ["IDEA", "DRAFT", "SUBMITTED", "CHANGES_REQUESTED", "APPROVED", "IN_PRODUCTION", "DONE"];

const actor = (appRole: AppRole, jobRole: JobRole): ContentActor => ({ id: "u1", appRole, jobRole });

describe("content permissions", () => {
  for (const appRole of APP_ROLES) {
    for (const jobRole of JOB_ROLES) {
      const u = actor(appRole, jobRole);
      const privileged = appRole === "LEAD" || appRole === "ADMIN";
      it(`${appRole}/${jobRole}`, () => {
        expect(canDraftContent(u)).toBe(appRole !== "REQUESTER" || jobRole === "SOCIAL_MEDIA");
        expect(canApproveContent(u)).toBe(privileged);
        expect(canManageChannels(u)).toBe(privileged);
      });
    }
  }
});

describe("content workflow", () => {
  it("allows the happy path", () => {
    expect(nextStatus("IDEA", "save", { hasContent: true })).toBe("DRAFT");
    expect(nextStatus("IDEA", "save", { hasContent: false })).toBe("IDEA");
    expect(nextStatus("DRAFT", "submit")).toBe("SUBMITTED");
    expect(nextStatus("CHANGES_REQUESTED", "submit")).toBe("SUBMITTED");
    expect(nextStatus("SUBMITTED", "sendBack")).toBe("CHANGES_REQUESTED");
    expect(nextStatus("SUBMITTED", "approve")).toBe("APPROVED");
    expect(nextStatus("APPROVED", "requestStarted")).toBe("IN_PRODUCTION");
    expect(nextStatus("APPROVED", "requestDone")).toBe("DONE");
    expect(nextStatus("IN_PRODUCTION", "requestDone")).toBe("DONE");
    expect(nextStatus("DONE", "requestReopened")).toBe("IN_PRODUCTION");
  });

  it("returns to DRAFT when the linked request is cancelled", () => {
    expect(nextStatus("APPROVED", "requestCancelled")).toBe("DRAFT");
    expect(nextStatus("IN_PRODUCTION", "requestCancelled")).toBe("DRAFT");
    expect(nextStatus("DONE", "requestCancelled")).toBe("DRAFT");
  });

  it("rejects disallowed moves", () => {
    expect(nextStatus("DRAFT", "approve")).toBeNull();
    expect(nextStatus("SUBMITTED", "save")).toBeNull();
    expect(nextStatus("IDEA", "submit")).toBeNull();
    expect(nextStatus("APPROVED", "requestReopened")).toBeNull();
    expect(nextStatus("IN_PRODUCTION", "requestStarted")).toBeNull();
    expect(nextStatus("DRAFT", "requestCancelled")).toBeNull();
  });

  it("isEditable and canDelete", () => {
    const editable = ["IDEA", "DRAFT", "CHANGES_REQUESTED"];
    const deletable = [...editable, "SUBMITTED"];
    for (const s of STATUSES) {
      expect(isEditable(s)).toBe(editable.includes(s));
      expect(canDelete(s)).toBe(deletable.includes(s));
    }
  });
});
