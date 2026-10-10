// Pure view helpers for the Library page. No DB or React imports.

export type LinkKind = "drive" | "docs" | "sheets" | "slides" | "figma" | "canva" | "pdf" | "web";

const BADGE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Jakarta",
});

function hostIs(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function linkKind(url: string): LinkKind {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "web";
  }
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname;

  if (host === "docs.google.com") {
    if (path.startsWith("/document/")) return "docs";
    if (path.startsWith("/spreadsheets/")) return "sheets";
    if (path.startsWith("/presentation/")) return "slides";
  }
  if (hostIs(host, "drive.google.com")) return "drive";
  if (hostIs(host, "figma.com")) return "figma";
  if (hostIs(host, "canva.com")) return "canva";
  if (path.toLowerCase().endsWith(".pdf")) return "pdf";
  return "web";
}

/** "New · 3 Oct" when never edited, "Updated · 3 Oct" when edited, null when older than 14 days. */
export function itemBadge(
  item: { createdAt: Date; contentUpdatedAt: Date },
  now: Date,
): string | null {
  const age = now.getTime() - item.contentUpdatedAt.getTime();
  if (age > BADGE_WINDOW_MS) return null;
  const label =
    item.createdAt.getTime() === item.contentUpdatedAt.getTime() ? "New" : "Updated";
  return `${label} · ${DATE_FMT.format(item.contentUpdatedAt)}`;
}

export type LibraryRow = {
  id: string;
  title: string;
  url: string;
  description: string | null;
  categoryId: string;
  brandId: string | null;
  brandName: string | null;
  pinned: boolean;
  sortOrder: number;
  createdAt: Date;
  contentUpdatedAt: Date;
};

export function filterRows(
  rows: LibraryRow[],
  f: { q: string; categoryId: string | null; brandId: string | null },
): LibraryRow[] {
  const q = f.q.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.categoryId !== null && r.categoryId !== f.categoryId) return false;
    if (f.brandId !== null && r.brandId !== f.brandId) return false;
    if (q === "") return true;
    let host: string;
    try {
      host = new URL(r.url).hostname;
    } catch {
      host = r.url;
    }
    const haystack = [r.title, r.description ?? "", host].join("\n").toLowerCase();
    return haystack.includes(q);
  });
}
