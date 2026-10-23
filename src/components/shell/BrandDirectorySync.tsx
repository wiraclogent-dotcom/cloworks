"use client";

import { useEffect } from "react";
import { setBrandDirectory } from "../ui/brandDirectory";

/** Hands the workspace's brand colours (read on the server) to every BrandTag on the page. Renders nothing. */
export function BrandDirectorySync({ entries }: { entries: { name: string; color: string }[] }) {
  useEffect(() => { setBrandDirectory(entries); }, [entries]);
  return null;
}
