import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArticle, loadArticles, HelpContentError } from "@/lib/help/content";

const ok = "---\ntitle: Creating a request\nsection: Requests\norder: 2\nrequiresPermission: request.create\n---\n\n## Steps\n\n1. Open **New request**.\n";

describe("parseArticle", () => {
  it("parses frontmatter and body", () => {
    const a = parseArticle("creating-a-request", ok);
    expect(a).toMatchObject({ slug: "creating-a-request", title: "Creating a request", section: "Requests", order: 2, requiresPermission: "request.create" });
    expect(a.body).toContain("## Steps");
  });

  it("accepts CRLF line endings and a UTF-8 byte-order mark", () => {
    const a = parseArticle("x", "﻿" + ok.replace(/\n/g, "\r\n"));
    expect(a.title).toBe("Creating a request");
    expect(a.body).not.toContain("\r");
  });

  it("leaves requiresPermission undefined when omitted", () => {
    const a = parseArticle("x", "---\ntitle: T\nsection: Getting started\norder: 1\n---\nbody");
    expect(a.requiresPermission).toBeUndefined();
  });

  it.each([
    ["missing title", "---\nsection: Requests\norder: 1\n---\nb"],
    ["unknown section", "---\ntitle: T\nsection: Nope\norder: 1\n---\nb"],
    ["unknown permission", "---\ntitle: T\nsection: Requests\norder: 1\nrequiresPermission: nope\n---\nb"],
    ["non-integer order", "---\ntitle: T\nsection: Requests\norder: first\n---\nb"],
    ["no frontmatter", "just text"],
  ])("throws HelpContentError naming the file for %s", (_, src) => {
    expect(() => parseArticle("bad-file", src)).toThrow(HelpContentError);
    expect(() => parseArticle("bad-file", src)).toThrow(/bad-file/);
  });
});

describe("loadArticles", () => {
  it("returns articles sorted by section order, then order", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "help-"));
    fs.writeFileSync(path.join(dir, "req.md"), "---\ntitle: Req\nsection: Requests\norder: 2\n---\nb");
    fs.writeFileSync(path.join(dir, "start.md"), "---\ntitle: Start\nsection: Getting started\norder: 1\n---\nb");
    expect(loadArticles(dir).map((a) => a.slug)).toEqual(["start", "req"]);
  });

  it("loads all eleven guides from the real directory with the expected slugs and order", () => {
    const articles = loadArticles(`${process.cwd()}/content/help`);
    expect(articles.map((a) => a.slug)).toEqual([
      "getting-started", "signing-in-and-roles",
      "requests-views", "creating-a-request", "request-details-and-statuses", "todays-overview-search-filters",
      "projects", "my-kpi", "team-kpi",
      "admin-users", "admin-lists",
    ]);
  });

  it("every real guide has a body", () => {
    for (const a of loadArticles(`${process.cwd()}/content/help`)) {
      expect(a.body.length).toBeGreaterThan(0);
    }
  });
});
