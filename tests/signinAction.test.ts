import { describe, it, expect, vi, beforeEach } from "vitest";

const signIn = vi.fn();
vi.mock("@/lib/auth", () => ({ signIn: (...a: unknown[]) => signIn(...a) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next-auth", () => ({ AuthError: class extends Error {} }));

import { passwordSignIn } from "@/app/signin/actions";

beforeEach(() => signIn.mockReset());

describe("passwordSignIn", () => {
  // Regression: landing on "/" made the proxy 302 to /requests during the client navigation, so the address bar kept "/"
  // and every server action on the board (sign out, status changes, chat) POSTed to "/" and got that redirect back.
  it("lands on /requests, not the landing page", async () => {
    const fd = new FormData();
    fd.set("email", "a@clogent.co.id");
    fd.set("password", "pw");
    await passwordSignIn(fd);
    expect(signIn).toHaveBeenCalledWith("credentials", { email: "a@clogent.co.id", password: "pw", redirectTo: "/requests" });
  });
});
