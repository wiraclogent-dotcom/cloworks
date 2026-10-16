/** The fixed set of category icon keys (server validation and the icon picker share it; no React here). */
export const CATEGORY_ICON_KEYS = ["book", "palette", "box", "megaphone", "folder"] as const;
export type CategoryIconKey = (typeof CATEGORY_ICON_KEYS)[number];
