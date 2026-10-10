import { describe, it, expect } from "vitest";
import { ACTION_FAILED_MESSAGE, safeAction } from "@/lib/safeAction";

describe("safeAction", () => {
  it("passes the action's own result through", async () => {
    expect(await safeAction(async () => ({ ok: true as const, id: "x" }))).toEqual({ ok: true, id: "x" });
  });
  it("turns a throw into a failed result with a connection message", async () => {
    expect(await safeAction(async () => { throw new TypeError("Failed to fetch"); })).toEqual({ ok: false, code: "ERROR", message: ACTION_FAILED_MESSAGE });
  });
});
