import { redirect } from "next/navigation";
import { ENTER_PATH } from "@/lib/auth.config";
import { first } from "@/lib/authForm";
import { loadLobbyState } from "@/lib/joinDeps";
import { safeNext } from "@/lib/joinTokens";
import { currentVisitor } from "@/lib/session";
import { VerifyForm } from "./VerifyForm";

export type VerifySearch = Promise<{ next?: string | string[] }>;

/** Members go to /requests (via /lobby/enter, which writes an upgraded cookie), already-verified applicants to /lobby; everyone else (signed in or not) gets the code form. */
export async function VerifyView({ searchParams }: { searchParams: VerifySearch }) {
  const visitor = await currentVisitor();
  if (visitor.kind === "member") redirect(ENTER_PATH);
  if (visitor.kind === "applicant") {
    const state = await loadLobbyState(visitor.applicant.id);
    if (state && state.kind !== "unverified") redirect("/lobby");
  }
  const next = safeNext(first((await searchParams).next), "");
  return <VerifyForm next={next || undefined} />;
}
