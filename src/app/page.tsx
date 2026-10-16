import type { Metadata } from "next";
import { Landing } from "@/components/landing/Landing";
import { LANDING_DESCRIPTION, LANDING_TITLE, landingJsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: { absolute: LANDING_TITLE },
  description: LANDING_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { title: LANDING_TITLE, description: LANDING_DESCRIPTION, url: "/" },
  twitter: { title: LANDING_TITLE, description: LANDING_DESCRIPTION },
};

// Public landing page. The proxy sends signed-in visitors straight to /requests, so this page never reads the session.
export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      {/* JSON-LD: `<` is escaped so the data can never close the script tag. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(landingJsonLd()).replace(/</g, "\\u003c") }} />
      <Landing />
    </div>
  );
}
