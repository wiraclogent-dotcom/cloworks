import { describe, it, expect, vi } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { LANDING_TITLE, landingJsonLd } from "@/lib/seo";

// The landing and root layout modules pull in fonts and client components; only their `metadata` exports matter here.
vi.mock("next/font/google", () => ({ Archivo: () => ({ variable: "--font-archivo" }) }));
vi.mock("@/components/landing/Landing", () => ({ Landing: () => null }));

describe("robots", () => {
  const r = robots();
  const rules = r.rules as { allow?: string | string[]; disallow?: string | string[] };
  it("allows the landing page and hides app, auth and api paths", () => {
    expect(rules.allow).toBe("/");
    for (const p of ["/requests", "/admin", "/signin", "/api"]) expect(rules.disallow).toContain(p);
  });
  it("points to the sitemap", () => {
    expect(r.sitemap).toBe("https://clowork.my.id/sitemap.xml");
  });
});

describe("sitemap", () => {
  it("lists only the landing page", () => {
    expect(sitemap()).toEqual([expect.objectContaining({ url: "https://clowork.my.id/" })]);
    expect(sitemap()).toHaveLength(1);
  });
});

describe("landingJsonLd", () => {
  const ld = landingJsonLd();
  it("is a SoftwareApplication named Clowork", () => {
    expect(ld["@type"]).toBe("SoftwareApplication");
    expect(ld.name).toBe("Clowork");
  });
  it("states nothing we cannot back up", () => {
    for (const k of ["offers", "aggregateRating", "review"]) expect(ld).not.toHaveProperty(k);
  });
});

describe("metadata", () => {
  it("landing page has its own title and a canonical of /", async () => {
    const { metadata } = await import("@/app/page");
    expect((metadata.title as { absolute: string }).absolute).toBe(LANDING_TITLE);
    expect(metadata.alternates?.canonical).toBe("/");
  });
  it("root layout sets metadataBase and keeps the title template", async () => {
    const { metadata } = await import("@/app/layout");
    expect((metadata.metadataBase as URL).href).toBe("https://clowork.my.id/");
    expect((metadata.title as { template: string }).template).toBe("%s · Clowork");
  });
});
