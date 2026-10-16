import { describe, it, expect } from "vitest";
import { platformAdminEmails, isPlatformAdmin, isPlatformAdminUser } from "@/lib/platformAdmin";

const env = { PLATFORM_ADMIN_EMAILS: "wira@clogent.co.id, ops@x.io" };

describe("platformAdminEmails", () => {
  it("splits on commas, trims, lowercases and drops empty entries", () => {
    expect(platformAdminEmails({ PLATFORM_ADMIN_EMAILS: " Wira@Clogent.co.id, ,ops@x.io " })).toEqual(["wira@clogent.co.id", "ops@x.io"]);
  });
  it("is empty when the variable is unset, so nobody is a platform admin", () => {
    expect(platformAdminEmails({})).toEqual([]);
  });
});

describe("isPlatformAdmin", () => {
  it("matches a listed email case-insensitively", () => {
    expect(isPlatformAdmin("WIRA@clogent.co.id", env)).toBe(true);
  });
  it("is false for null, undefined, empty, or an unlisted email", () => {
    expect(isPlatformAdmin(null, env)).toBe(false);
    expect(isPlatformAdmin(undefined, env)).toBe(false);
    expect(isPlatformAdmin("", env)).toBe(false);
    expect(isPlatformAdmin("x@y.z", env)).toBe(false);
  });
  it("is false for everyone when the variable is unset", () => {
    expect(isPlatformAdmin("x@y.z", {})).toBe(false);
  });
});

describe("isPlatformAdminUser", () => {
  const stub = (result: { email: string | null } | null) => ({
    user: { findUnique: async () => result },
  });
  it("is false when the user has no email", async () => {
    expect(await isPlatformAdminUser(stub({ email: null }), "u1", env)).toBe(false);
  });
  it("is false when the user does not exist", async () => {
    expect(await isPlatformAdminUser(stub(null), "u1", env)).toBe(false);
  });
  it("is true when the user's email is listed", async () => {
    expect(await isPlatformAdminUser(stub({ email: "Wira@Clogent.co.id" }), "u1", env)).toBe(true);
  });
  it("looks the user up by id and selects only the email", async () => {
    let seen: unknown;
    const db = { user: { findUnique: async (args: unknown) => { seen = args; return { email: "ops@x.io" }; } } };
    expect(await isPlatformAdminUser(db, "u42", env)).toBe(true);
    expect(seen).toEqual({ where: { id: "u42" }, select: { email: true } });
  });
});
