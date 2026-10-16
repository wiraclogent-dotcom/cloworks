"use client";

import { useEffect } from "react";
import { applyTheme, readThemePref } from "@/lib/theme";

/**
 * The landing page is light only. The boot script already paints "/" light on a full load; this covers arriving by
 * client-side navigation, and puts the person's own choice back when they leave for another page.
 */
export function LightOnly() {
  useEffect(() => {
    applyTheme("light");
    return () => { applyTheme(readThemePref()); };
  }, []);
  return null;
}
