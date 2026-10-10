import { describe, it, expect, vi } from "vitest";
import { UnauthenticatedError } from "@/lib/session-core";

vi.mock("@/lib/session", () => ({ requireUser: async () => { throw new UnauthenticatedError(); } }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("redirect should not happen"); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { submitRequest } from "@/app/(app)/requests/actions";
import { setTarget } from "@/app/(app)/dashboard/targets/actions";
import { saveUser } from "@/app/(app)/admin/users/actions";
import { saveBrand } from "@/app/(app)/admin/lists/actions";
import { submitProject, createProject } from "@/app/(app)/projects/actions";
import { addComment, setIncludeKpi } from "@/app/(app)/requests/[id]/actions";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "@/app/(app)/notifications/actions";
import { chatUnreadCount, listChats, listMessages, markChatRead, sendChatMessage } from "@/app/(app)/chat/actions";

const MSG = "Your session ended. Sign in again.";
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

describe("server actions return a result object when the session ended", () => {
  it("setTarget", async () => {
    expect(await setTarget("u", "2026-10", "DESIGNER", 5)).toEqual({ ok: false, code: "UNAUTHENTICATED", message: MSG });
  });
  it("submitRequest echoes the typed values", async () => {
    const r = await submitRequest(null, fd({ title: "Poster", deadline: "2026-12-01" }));
    expect(r).toMatchObject({ ok: false, code: "UNAUTHENTICATED", message: MSG, values: { title: "Poster", deadline: "2026-12-01" } });
  });
  it("submitProject echoes the typed values", async () => {
    expect(await submitProject(null, null, fd({ title: "Rebrand" }))).toMatchObject({ ok: false, code: "UNAUTHENTICATED", message: MSG, values: { title: "Rebrand" } });
  });
  it("admin form actions", async () => {
    expect(await saveUser(null, fd({ userId: "u1", fullName: "X" }))).toMatchObject({ ok: false, code: "UNAUTHENTICATED", message: MSG, values: { fullName: "X" } });
    expect(await saveBrand(null, fd({ name: "B" }))).toMatchObject({ ok: false, code: "UNAUTHENTICATED", message: MSG });
  });
  it("project, comment and KPI-flag actions", async () => {
    expect(await createProject({ title: "x", ownerId: "o", status: "NOT_STARTED" })).toMatchObject({ ok: false, code: "UNAUTHENTICATED" });
    expect(await addComment("r", "hi")).toMatchObject({ ok: false, code: "UNAUTHENTICATED", message: MSG });
    expect(await setIncludeKpi("r", false)).toMatchObject({ ok: false, code: "UNAUTHENTICATED" });
  });
  it("notification actions", async () => {
    for (const r of [await listNotifications(), await markNotificationRead("n"), await markAllNotificationsRead()])
      expect(r).toEqual({ ok: false, code: "UNAUTHENTICATED", message: MSG });
  });
  it("chat actions", async () => {
    for (const r of [await chatUnreadCount(), await listChats(), await listMessages("r"), await markChatRead("r"), await sendChatMessage("r", "hi")])
      expect(r).toEqual({ ok: false, code: "UNAUTHENTICATED", message: MSG });
  });
});
