import type { Metadata } from "next";
import { Suspense } from "react";
import { stripInterceptionMarkers } from "@/lib/interceptedParam";
import { PanelForId } from "./PanelForId";

/** Same tab title as the full page ("Request · Cloworks"); without it the panel left just "Cloworks". */
export const metadata: Metadata = { title: "Request" };

export default function RequestPanel({ params: raw }: { params: Promise<{ id: string }> }) {
  // Dev-only Next bug: the intercepted id can arrive as "(.)<id>"; see stripInterceptionMarkers.
  const params = raw.then((p) => ({ ...p, id: stripInterceptionMarkers(p.id) }));
  // The id is only known after awaiting params, which must happen inside Suspense (cacheComponents).
  return <Suspense fallback={null}><PanelForId params={params} /></Suspense>;
}
