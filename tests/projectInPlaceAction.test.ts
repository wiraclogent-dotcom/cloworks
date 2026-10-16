import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb, type TestDb } from "./helpers/testDb";

const h = vi.hoisted(() => ({ prisma: null as unknown as PrismaClient, user: { id: "u", appRole: "CREATIVE" as string }, redirect: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireUser: async () => h.user, dbFor: () => h.prisma }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => h.revalidate(...a) }));
vi.mock("next/navigation", () => ({ redirect: (...a: unknown[]) => h.redirect(...a) }));

import { submitProjectInPlace } from "@/app/(app)/projects/actions";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

describe("submitProjectInPlace", () => {
  let db: TestDb;
  let ownerId: string, projectId: string;
  beforeAll(async () => {
    db = await createTestDb();
    h.prisma = db.prisma;
    ownerId = (await db.prisma.user.create({ data: { email: "o@clogent.co.id", name: "Owner", fullName: "Owner", appRole: "CREATIVE" } })).id;
    h.user = { id: ownerId, appRole: "CREATIVE" };
    projectId = (await db.prisma.project.create({ data: { title: "Old", ownerId, status: "IN_PROGRESS" } })).id;
  });
  afterAll(async () => { await db?.stop(); });

  it("saves, revalidates the list and detail pages, returns ok and does not redirect", async () => {
    const r = await submitProjectInPlace(projectId, null, fd({ title: "New title", ownerId, status: "IN_REVIEW" }));
    expect(r).toMatchObject({ ok: true, nonce: expect.any(String) });
    expect(h.redirect).not.toHaveBeenCalled();
    expect(h.revalidate).toHaveBeenCalledWith("/projects");
    expect(h.revalidate).toHaveBeenCalledWith(`/projects/${projectId}`);
    expect(await db.prisma.project.findUnique({ where: { id: projectId } })).toMatchObject({ title: "New title", status: "IN_REVIEW" });
  });
  it("returns field errors for invalid data, like submitProject", async () => {
    const r = await submitProjectInPlace(projectId, null, fd({ title: "", ownerId, status: "IN_REVIEW" }));
    expect(r).toMatchObject({ ok: false, code: "VALIDATION", fieldErrors: { title: expect.any(String) }, values: { title: "" } });
    expect(h.redirect).not.toHaveBeenCalled();
  });
});
