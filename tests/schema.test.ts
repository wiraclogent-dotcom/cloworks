import { describe, it, expect } from "vitest";
import { beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./helpers/testDb";
import { AppRole, JobRole, RequestStatus, ProjectStatus } from "@prisma/client";

describe("schema enums", () => {
  it("RequestStatus has exactly 5 values", () => {
    expect(Object.values(RequestStatus).sort()).toEqual(
      ["CANCELLED", "DONE", "FIRST_LOOK", "ON_PROGRESS", "REQUESTED"].sort(),
    );
  });
  it("ProjectStatus has exactly 5 values", () => {
    expect(Object.values(ProjectStatus).sort()).toEqual(
      ["DONE", "IN_PROGRESS", "IN_REVIEW", "NOT_STARTED", "ON_HOLD"].sort(),
    );
  });
  it("AppRole has exactly 4 values", () => {
    expect(Object.values(AppRole).sort()).toEqual(["ADMIN", "CREATIVE", "LEAD", "REQUESTER"]);
  });
  it("JobRole has exactly 3 values", () => {
    expect(Object.values(JobRole).sort()).toEqual(["DESIGNER", "OTHER", "SOCIAL_MEDIA"]);
  });
});

describe("workspace join fields", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(async () => {
    await db?.stop();
  });

  it("Clogent has emailDomain clogent.co.id and a join code", async () => {
    const ws = await db.raw.workspace.findUniqueOrThrow({ where: { id: "clogent" } });
    expect(ws.emailDomain).toBe("clogent.co.id");
    expect(ws.joinCode).toMatch(/^[A-Za-z0-9_-]{16,}$/);
    expect(ws.joinLinkEnabled).toBe(true);
  });
});
