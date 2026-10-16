import { describe, it, expect, vi } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { LANDING_TITLE, NOINDEX_PATHS, landingJsonLd } from "@/lib/seo";

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
  it("disallows exactly the full NOINDEX_PATHS list", () => {
    expect(rules.disallow).toEqual([...NOINDEX_PATHS]);
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
  // Next merges metadata shallowly: the page's openGraph/twitter replace the layout's, so the defaults must be on both.
  it.each([
    ["landing page", () => import("@/app/page")],
    ["root layout", () => import("@/app/layout")],
  ])("%s carries the shared Open Graph and Twitter defaults", async (_label, load) => {
    const { metadata } = await load();
    expect(metadata.openGraph).toMatchObject({ siteName: "Clowork", type: "website", locale: "en_US" });
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
  });
  it("landing page keeps its own Open Graph and Twitter title", async () => {
    const { metadata } = await import("@/app/page");
    expect(metadata.openGraph).toMatchObject({ title: LANDING_TITLE, url: "/" });
    expect(metadata.twitter).toMatchObject({ title: LANDING_TITLE });
  });
  it("root layout sets metadataBase and keeps the title template", async () => {
    const { metadata } = await import("@/app/layout");
    expect((metadata.metadataBase as URL).href).toBe("https://clowork.my.id/");
    expect((metadata.title as { template: string }).template).toBe("%s · Clowork");
  });
});
