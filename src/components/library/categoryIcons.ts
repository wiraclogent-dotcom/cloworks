import { BookOpen, Box, Folder, Megaphone, Palette, type LucideIcon } from "lucide-react";
import { CATEGORY_ICON_KEYS, type CategoryIconKey } from "@/lib/libraryIcons";

export { CATEGORY_ICON_KEYS };
/** Key to lucide icon (the key list itself lives in lib/libraryIcons so the server can validate with it). */
export const CATEGORY_ICON: Record<CategoryIconKey, LucideIcon> = {
  book: BookOpen, palette: Palette, box: Box, megaphone: Megaphone, folder: Folder,
};
export const categoryIcon = (key: string | null): LucideIcon => (key ? (CATEGORY_ICON as Record<string, LucideIcon>)[key] : undefined) ?? Folder;
