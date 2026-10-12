import type { Metadata } from "next";
import { Landing } from "@/components/landing/Landing";

export const metadata: Metadata = {
  title: { absolute: "Cloworks: creative requests from brief to done" },
  description: "Send design and video briefs, follow them across the board, and see the team's finished work against its monthly target.",
};

// Public landing page. The proxy sends signed-in visitors straight to /requests, so this page never reads the session.
export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <Landing />
    </div>
  );
}
