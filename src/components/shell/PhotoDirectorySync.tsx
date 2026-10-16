"use client";

import { useEffect } from "react";
import { setPhotoDirectory, type PhotoEntry } from "../ui/photoDirectory";

/** Hands the workspace's photo list (read on the server) to every Avatar on the page. Renders nothing. */
export function PhotoDirectorySync({ entries }: { entries: PhotoEntry[] }) {
  useEffect(() => { setPhotoDirectory(entries); }, [entries]);
  return null;
}
