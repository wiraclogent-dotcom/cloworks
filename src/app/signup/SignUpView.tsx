import Link from "next/link";
import { oauthProviderIds } from "@/lib/auth.config";
import { first, isJoinCode } from "@/lib/authForm";
import { safeNext } from "@/lib/joinTokens";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";
import { GoogleButton, OrDivider } from "@/components/auth/ProviderButtons";
import { SignUpForm } from "./SignUpForm";

export type SignUpSearch = Promise<{ join?: string | string[]; next?: string | string[] }>;

/**
 * Reads the query (dynamic). `?join=<code>` (from a join link) or `?next=/join/...` (from sign-in) is carried through
 * sign-up and verification; anything that is not a join code or a join/lobby path is dropped.
 */
export async function SignUpView({ searchParams }: { searchParams: SignUpSearch }) {
  const sp = await searchParams;
  let join = isJoinCode(first(sp.join)) ? first(sp.join) : undefined;
  const rawNext = safeNext(first(sp.next), "");
  // Arriving from /signin?next=/join/<code>: treat it like ?join=<code>.
  const fromNext = /^\/join\/([^/]+)$/.exec(rawNext)?.[1];
  if (!join && isJoinCode(fromNext) && fromNext !== "invite") join = fromNext;
  const next = join ? `/join/${join}` : rawNext || undefined;
  const google = oauthProviderIds().includes("google");
  return (
    <div className="space-y-4">
      {google && (
        <div className="space-y-3">
          <GoogleButton next={next} />
          <OrDivider />
        </div>
      )}
      <SignUpForm join={join} next={join ? undefined : next} minLength={MIN_PASSWORD_LENGTH} />
      <p className="text-sm text-foreground-secondary">
        Already have an account?{" "}
        <Link href={next ? `/signin?next=${encodeURIComponent(next)}` : "/signin"} className="font-medium text-brand-deep-blue underline-offset-4 hover:underline">Sign in</Link>
      </p>
    </div>
  );
}
