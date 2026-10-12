/** Branded email layout. Pure: no framework or database imports. */

export type EmailContent = {
  preheader: string;
  heading: string;
  lines: string[];
  code?: string;
  button?: { label: string; url: string };
  note?: string;
};
export type RenderedEmail = { html: string; text: string };

const HELP = "Need help? Contact your workspace admin.";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function safeBaseUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.origin + u.pathname.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function isHttpUrl(u: string): boolean {
  try {
    const p = new URL(u.trim()).protocol;
    return p === "http:" || p === "https:";
  } catch {
    return false;
  }
}

export function renderEmail(c: EmailContent, opts: { baseUrl?: string } = {}): RenderedEmail {
  const base = safeBaseUrl("baseUrl" in opts ? opts.baseUrl : process.env.APP_BASE_URL);
  const host = base ? new URL(base).host : null;
  const button = c.button && isHttpUrl(c.button.url) ? { label: c.button.label, url: c.button.url.trim() } : null;
  const e = escapeHtml;

  const logo = base
    ? `<td style="padding-right:10px;"><img src="${e(base)}/email/logo.png" alt="Cloworks" width="28" height="28" style="display:block;border:0;"></td>`
    : "";
  const paras = c.lines
    .map((l) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#17181c;">${e(l)}</p>`)
    .join("");
  const code = c.code
    ? `<div style="margin:6px 0 18px;padding:14px 16px;background:#f5f3ee;border-radius:8px;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:28px;letter-spacing:4px;color:#17181c;text-align:center;">${e(c.code)}</div>`
    : "";
  const btn = button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 18px;"><tr><td bgcolor="#11aa9f" style="background:#11aa9f;border-radius:8px;"><a href="${e(button.url)}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${e(button.label)}</a></td></tr></table>`
    : "";
  const note = c.note ? `<p style="margin:0;font-size:13px;line-height:1.5;color:#7d8088;">${e(c.note)}</p>` : "";
  const footer = [e(HELP), host ? `Cloworks &middot; ${e(host)}` : ""].filter(Boolean).join("<br>");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(c.heading)}</title></head>
<body style="margin:0;padding:0;background:#f5f3ee;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f5f3ee;">${e(c.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f3ee" style="background:#f5f3ee;"><tr><td align="center" style="padding:24px 12px;font-family:${FONT};">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
<tr><td bgcolor="#09426d" style="background:#09426d;padding:18px 24px;border-radius:12px 12px 0 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${logo}<td style="font-size:18px;font-weight:700;color:#ffffff;font-family:${FONT};">Cloworks</td></tr></table></td></tr>
<tr><td bgcolor="#ffffff" style="background:#ffffff;padding:28px 24px;border-radius:0 0 12px 12px;font-family:${FONT};">
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#17181c;">${e(c.heading)}</h1>${paras}${code}${btn}${note}
</td></tr>
<tr><td style="padding:16px 24px;font-size:12px;line-height:1.6;color:#7d8088;text-align:center;font-family:${FONT};">${footer}</td></tr>
</table></td></tr></table></body></html>`;

  const parts = [c.heading, "", c.lines.join("\n\n")];
  if (c.code) parts.push("", c.code);
  if (button) parts.push("", `${c.button!.label}: ${button.url}`);
  if (c.note) parts.push("", c.note);
  parts.push("", "--", HELP);
  if (host) parts.push(`Cloworks · ${host}`);
  return { html, text: parts.join("\n") + "\n" };
}
