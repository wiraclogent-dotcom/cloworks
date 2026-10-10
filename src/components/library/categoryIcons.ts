import { BookOpen, Box, Folder, Megaphone, Palette, type LucideIcon } from "lucide-react";

/** The fixed set of category icon keys (shared by the page and the Categories dialog). */
export const CATEGORY_ICON: Record<string, LucideIcon> = {
  book: BookOpen, palette: Palette, box: Box, megaphone: Megaphone, folder: Folder,
};
export const CATEGORY_ICON_KEYS = Object.keys(CATEGORY_ICON);
export const categoryIcon = (key: string | null): LucideIcon => (key ? CATEGORY_ICON[key] : undefined) ?? Folder;
