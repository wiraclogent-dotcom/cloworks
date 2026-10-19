"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import { useMarketingSheet } from "./sheetState";

/** The header's primary action; opens the activity sheet for a new activity. */
export function AddActivityButton() {
  const sheet = useMarketingSheet();
  return <Button variant="default" icon={<Plus aria-hidden="true" strokeWidth={1.75} />} onClick={() => sheet.open({ mode: "new" })}>Add activity</Button>;
}
