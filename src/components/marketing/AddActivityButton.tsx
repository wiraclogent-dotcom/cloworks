"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/shadcn/button";

/** The header's primary action; opens the activity sheet for a new activity. */
export function AddActivityButton() {
  return <Button icon={<Plus aria-hidden="true" strokeWidth={1.75} />}>Add activity</Button>;
}
