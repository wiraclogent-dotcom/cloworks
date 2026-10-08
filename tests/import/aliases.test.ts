import { describe, it, expect } from "vitest";
import { resolveUser } from "@/lib/import/aliases";
import { users } from "./fixtures";

describe("resolveUser", () => {
  it.each([
    ["Irshyad", "u-irsyad"], ["irsyad", "u-irsyad"], ["IRSYAD ", "u-irsyad"], ["  Irsyad  Ahnaf Fauzian", "u-irsyad"],
    ["Rio", "u-rio"], ["Rifky", "u-rifqy"], ["Fafa & Yoel", "u-fafa"], ["fafa  yoel", "u-fafa"], ["Daus", "u-daus"],
  ])("%s -> %s", (n, id) => expect(resolveUser(n, users)).toBe(id));
  it("empty/unknown -> null", () => {
    expect(resolveUser("", users)).toBeNull();
    expect(resolveUser("   ", users)).toBeNull();
    expect(resolveUser("Nobody", users)).toBeNull();
  });
  it("ambiguous -> null", () => {
    const amb = [...users, { id: "u-x", name: "Rio", fullName: null, aliases: [], active: true }];
    expect(resolveUser("Rio", amb)).toBeNull();
  });
});
