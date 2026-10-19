"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { MarketingMonthData } from "@/lib/marketing/types";

/** What the activity sheet shows: an existing activity, a new one (optionally pre-filled), or nothing. */
export type SheetState = { mode: "edit"; activityId: string } | { mode: "new"; divisionId?: string; day?: string } | null;

type SheetApi = { open: (s: NonNullable<SheetState>) => void };
const MarketingSheetContext = createContext<SheetApi | null>(null);
const NOOP: SheetApi = { open: () => {} };

/** Opens the page's one activity sheet (header "Add activity", bars, empty lane days, agenda rows). */
export function useMarketingSheet(): SheetApi {
  return useContext(MarketingSheetContext) ?? NOOP;
}

/** Owns the sheet state for the whole Marketing Calendar page, so the server-rendered header and the grid share it. */
export function MarketingSheetProvider({ data, children, renderSheet }: {
  data: MarketingMonthData; children: ReactNode;
  renderSheet?: (args: { data: MarketingMonthData; state: SheetState; onClose: () => void }) => ReactNode;
}) {
  const [state, setState] = useState<SheetState>(null);
  return (
    <MarketingSheetContext.Provider value={{ open: setState }}>
      {children}
      {renderSheet ? renderSheet({ data, state, onClose: () => setState(null) }) : null}
    </MarketingSheetContext.Provider>
  );
}
