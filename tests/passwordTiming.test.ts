import { describe, it, expect, vi, beforeEach } from "vitest";

// Count the hashing work authenticateWithPassword does, keeping the real implementations.
vi.mock("@/lib/password", async (orig) => {
  const m = await orig<typeof import("@/lib/password")>();
  return { ...m, verifyPassword: vi.fn(m.verifyPassword), dummyHash: vi.fn(m.dummyHash) };
});
import { dummyHash, hashPassword, verifyPassword } from "@/lib/password";
import { authenticateWithPassword } from "@/lib/passwordAuth";

type Row = Record<string, unknown> | null;
const fakeDb = (user: Row, applicant: Row) =>
  ({
    user: { findFirst: async () => user, update: async () => ({}) },
    applicant: { findUnique: async () => applicant, update: async () => ({}) },
  }) as unknown as Parameters<typeof authenticateWithPassword>[0];

describe("password sign-in spends the same hashing work for unknown emails", () => {
  beforeEach(() => {
    vi.mocked(verifyPassword).mockClear();
    vi.mocked(dummyHash).mockClear();
  });

  it("no User and no Applicant: verifies against the dummy hash", async () => {
    expect(await authenticateWithPassword(fakeDb(null, null), "nobody@gmail.com", "some-password-1")).toBeNull();
    expect(dummyHash).toHaveBeenCalledTimes(1);
    expect(verifyPassword).toHaveBeenCalledTimes(1);
  });

  it("an empty email also verifies against the dummy hash", async () => {
    expect(await authenticateWithPassword(fakeDb(null, null), "   ", "some-password-1")).toBeNull();
    expect(verifyPassword).toHaveBeenCalledTimes(1);
  });

  it("a known applicant with a wrong password does exactly one verify too", async () => {
    const applicant = { id: "a1", email: "a@gmail.com", passwordHash: await hashPassword("right-password-1"), failedLogins: 0, lockedUntil: null };
    vi.mocked(verifyPassword).mockClear();
    expect(await authenticateWithPassword(fakeDb(null, applicant), "a@gmail.com", "wrong-password-1")).toBeNull();
    expect(verifyPassword).toHaveBeenCalledTimes(1);
    expect(dummyHash).not.toHaveBeenCalled();
  });
});
