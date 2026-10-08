"use client";

import { createContext, useContext } from "react";

/** Whether the desktop sidebar is collapsed to the icon rail (the mobile drawer always shows labels). */
export const SidebarCollapsedContext = createContext(false);
export const useSidebarCollapsed = () => useContext(SidebarCollapsedContext);
