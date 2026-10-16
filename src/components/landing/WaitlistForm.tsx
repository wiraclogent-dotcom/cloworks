"use client";

import { useActionState } from "react";
import { joinWaitlist } from "@/app/waitlistActions";
import type { AuthFormState } from "@/lib/authForm";
import { WAITLIST_SIZES } from "@/lib/waitlist";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import { NativeSelect } from "@/components/shadcn/native-select";
import { cn } from "@/components/ui/cn";
import { GLASS } from "./glassBand";

/** Frosted white fields for the closing band (the same whites as the rest of the landing's glass). */
const glassField = cn("h-11", GLASS.card, GLASS.frost);

/**
 * The landing's waitlist sign-up. Same pattern as the auth forms: the outcome comes back as data, an error shows above
 * the fields and the fields remount with the values echoed, a success replaces the fields with the confirmation.
 * `website` is the honeypot: hidden from people and screen readers, so only a bot fills it.
 */
export function WaitlistForm({ action = joinWaitlist }: { action?: (prev: AuthFormState, fd: FormData) => Promise<AuthFormState> }) {
  const [state, run, pending] = useActionState<AuthFormState, FormData>(action, null);

  if (state?.info) {
    return <Alert variant="success"><AlertDescription>{state.info}</AlertDescription></Alert>;
  }

  const v = state?.values ?? {};
  return (
    <form key={state?.nonce ?? "initial"} action={run} className="space-y-4">
      {state?.error && <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert>}
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_9rem_auto] md:items-end">
        <div>
          <Label htmlFor="waitlist-email">Work email</Label>
          <Input id="waitlist-email" name="email" type="email" autoComplete="email" maxLength={320} required defaultValue={v.email ?? ""} className={glassField} />
        </div>
        <div>
          <Label htmlFor="waitlist-team">Team or company</Label>
          <Input id="waitlist-team" name="team" autoComplete="organization" maxLength={120} required defaultValue={v.team ?? ""} className={glassField} />
        </div>
        <div>
          <Label htmlFor="waitlist-size">Team size</Label>
          <NativeSelect id="waitlist-size" name="teamSize" required defaultValue={v.teamSize ?? ""} selectClassName={glassField}>
            <option value="" disabled>Choose</option>
            {WAITLIST_SIZES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </NativeSelect>
        </div>
        <Button type="submit" variant="default" loading={pending} className="h-11 px-6 text-[15px]">
          {pending ? "Joining…" : "Join the waitlist"}
        </Button>
      </div>
      <div className="sr-only" aria-hidden="true">
        <label>
          Website
          <input name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
    </form>
  );
}
