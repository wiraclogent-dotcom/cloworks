import { describe, it, expect } from "vitest";
import { newToken, hashToken, newCode, hashCode, codeMatches, newJoinCode, maskEmail, safeNext, codeSecret } from "@/lib/joinTokens";

describe("tokens", () => {
  it("newToken is 43 chars and unique; hashToken is stable sha256 hex", () => {
    const a = newToken();
    expect(a).toHaveLength(43);
    expect(newToken()).not.toBe(a);
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(a)).toBe(hashToken(a));
  });
  it("newJoinCode is base64url", () => {
    expect(newJoinCode()).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });
});

describe("codes", () => {
  it("newCode is always six digits", () => {
    for (let i = 0; i < 200; i++) expect(newCode()).toMatch(/^\d{6}$/);
  });
  it("codeMatches checks code and secret, and never throws on bad hashes", () => {
    const h = hashCode("482913", "s");
    expect(codeMatches("482913", h, "s")).toBe(true);
    expect(codeMatches("482914", h, "s")).toBe(false);
    expect(codeMatches("482913", h, "other")).toBe(false);
    expect(codeMatches("482913", "abcd", "s")).toBe(false);
  });
});

describe("maskEmail", () => {
  it("keeps the first character and the domain", () => {
    expect(maskEmail("andi@gmail.com")).toBe("a***@gmail.com");
    expect(maskEmail("a@x.co")).toBe("a***@x.co");
  });
});

describe("safeNext", () => {
  it("allows /lobby and /join/ paths", () => {
    expect(safeNext("/join/abc")).toBe("/join/abc");
    expect(safeNext("/lobby")).toBe("/lobby");
  });
  it("falls back for anything else", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "/join//evil.com", "/requests", "", undefined, null]) {
      expect(safeNext(bad)).toBe("/lobby");
    }
    expect(safeNext("/x", "/join/z")).toBe("/join/z");
  });
});

describe("codeSecret", () => {
  it("reads AUTH_SECRET and throws without it", () => {
    expect(() => codeSecret({})).toThrow();
    expect(codeSecret({ AUTH_SECRET: "x" })).toBe("x");
  });
});
