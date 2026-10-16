import { describe, it, expect, vi, beforeEach } from "vitest";

const send = vi.fn<(m: { to: string; subject: string; text: string; html?: string }) => Promise<void>>(async () => {});
const baseUrl = vi.fn(async () => "https://clowork.my.id");
const after = vi.fn((fn: () => unknown) => void fn());

vi.mock("next/server", () => ({ after: (fn: () => unknown) => after(fn) }));
vi.mock("@/lib/joinDeps", () => ({ requestBaseUrl: () => baseUrl() }));
vi.mock("@/lib/notify", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/notify")>()),
  realMailer: () => ({ send }),
  bestEffort: async (fn: () => Promise<void>) => {
    try { await fn(); } catch { /* swallowed like the real one */ }
  },
}));
// The sign-up logic is covered in waitlist.test.ts; here a new entry is reported straight to `notify`.
vi.mock("@/lib/waitlistDeps", () => ({
  joinWaitlistBy: async (notify: (e: unknown) => void) => {
    notify({ email: "typed@visitor.co", team: "Acme", teamSize: "SIZE_6_15" });
    return null;
  },
}));

import { joinWaitlist } from "@/app/waitlistActions";

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  send.mockClear();
  after.mockClear();
  baseUrl.mockResolvedValue("https://clowork.my.id");
  delete process.env.PLATFORM_ADMIN_EMAILS;
});

describe("joinWaitlist action", () => {
  it("attempts no send when there are no platform admins", async () => {
    await joinWaitlist(null, new FormData());
    await flush();
    expect(send).not.toHaveBeenCalled();
  });

  it("emails exactly the platform admins, never the typed address, with the size label and admin link", async () => {
    process.env.PLATFORM_ADMIN_EMAILS = "Wira@Clogent.co.id, ops@x.io";
    await joinWaitlist(null, new FormData());
    await flush();
    expect(send.mock.calls.map((c) => c[0].to).sort()).toEqual(["ops@x.io", "wira@clogent.co.id"]);
    for (const [m] of send.mock.calls) {
      expect(m.subject).toBe("New waitlist signup: Acme");
      expect(m.text).toContain("6–15");
      expect(m.text).toContain("typed@visitor.co");
      expect(m.html).toContain("https://clowork.my.id/admin/waitlist");
    }
  });

  it("leaves the button out when there is no trusted base url", async () => {
    process.env.PLATFORM_ADMIN_EMAILS = "ops@x.io";
    baseUrl.mockResolvedValue("");
    await joinWaitlist(null, new FormData());
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].html).not.toContain("/admin/waitlist");
    expect(send.mock.calls[0][0].text).toContain("Acme");
  });

  it("sends inline when after() throws (outside a request)", async () => {
    process.env.PLATFORM_ADMIN_EMAILS = "ops@x.io";
    after.mockImplementationOnce(() => { throw new Error("outside a request scope"); });
    await joinWaitlist(null, new FormData());
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
  });
});
