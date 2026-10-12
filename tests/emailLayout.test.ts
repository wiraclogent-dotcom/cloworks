import { describe, it, expect } from "vitest";
import { renderEmail, type EmailContent } from "@/lib/emailLayout";

const base: EmailContent = { preheader: "pre", heading: "Hello", lines: ["line one"] };
const BASE = "https://clowork.my.id";

describe("renderEmail", () => {
  it("escapes every field", () => {
    const { html } = renderEmail(
      { preheader: "<p>", heading: "<b>H</b>", lines: ["a & b"], note: "q\"uote'", code: "<1>", button: { label: "<i>", url: "https://x.test/r" } },
      { baseUrl: BASE },
    );
    for (const s of ["&lt;b&gt;H&lt;/b&gt;", "a &amp; b", "&quot;", "&#39;", "&lt;1&gt;", "&lt;i&gt;", "&lt;p&gt;"]) expect(html).toContain(s);
    expect(html).not.toContain("<b>H");
    expect(html).not.toContain("<i>");
  });

  it("renders the button only for http(s) urls", () => {
    const ok = renderEmail({ ...base, button: { label: "Set new password", url: "https://x.test/r?a=1&b=2" } }, { baseUrl: BASE });
    expect(ok.html).toContain('href="https://x.test/r?a=1&amp;b=2"');
    expect(ok.html).toContain("Set new password");
    for (const url of ["", "/signin", "javascript:alert(1)"]) {
      const r = renderEmail({ ...base, button: { label: "Set new password", url } }, { baseUrl: BASE });
      expect(r.html).not.toContain("href=");
      expect(r.text).not.toContain("Set new password");
    }
  });

  it("logo only with a safe base url", () => {
    const withLogo = renderEmail(base, { baseUrl: BASE }).html;
    expect(withLogo).toContain('src="https://clowork.my.id/email/logo.png"');
    expect(withLogo).toContain('alt=""');
    for (const baseUrl of [undefined, "ftp://x"]) {
      const html = renderEmail(base, { baseUrl }).html;
      expect(html).not.toContain("<img");
      expect(html).toMatch(/#09426d[\s\S]*Cloworks/);
    }
  });

  it("brand colours", () => {
    const { html } = renderEmail({ ...base, button: { label: "Go", url: "https://x.test" } }, { baseUrl: BASE });
    for (const c of ["#09426d", "#0b7d75", "#f5f3ee"]) expect(html).toContain(c);
    expect(html).not.toContain("#11aa9f"); // white on the brand aqua is ~2.9:1; the darker aqua keeps the button readable
  });

  it("text part", () => {
    const { text } = renderEmail(
      { ...base, code: "ABC123", note: "a note", button: { label: "Set new password", url: "https://x.test/r" } },
      { baseUrl: BASE },
    );
    expect(text.startsWith("Hello")).toBe(true);
    for (const s of ["line one", "ABC123", "Set new password: https://x.test/r", "a note"]) expect(text).toContain(s);
    expect(text.slice(text.lastIndexOf("--"))).toContain("Need help? Contact your workspace admin.");
    expect(text).not.toContain("<");
  });

  it("footer in html", () => {
    const { html } = renderEmail(base, { baseUrl: BASE });
    expect(html).toContain("Need help? Contact your workspace admin.");
    expect(html).toContain("clowork.my.id");
  });

  it("preheader is hidden", () => {
    const { html } = renderEmail({ ...base, preheader: "Inbox preview" }, { baseUrl: BASE });
    expect(html).toMatch(/display:none[^>]*>[^<]*Inbox preview/);
  });

  it("long content is kept", () => {
    const long = "x".repeat(400);
    const r = renderEmail({ ...base, lines: [long] }, { baseUrl: BASE });
    expect(r.html).toContain(long);
    expect(r.text).toContain(long);
  });
});
