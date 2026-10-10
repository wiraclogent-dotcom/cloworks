"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/components/ui/Button";
import { markAllNotificationsRead } from "./actions";

export function MarkAllButton({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={disabled || pending} className={buttonClass({ variant: "ghost", size: "sm" })}
      onClick={() => start(async () => { await markAllNotificationsRead(); router.refresh(); })}>
      Mark all as read
    </button>
  );
}
