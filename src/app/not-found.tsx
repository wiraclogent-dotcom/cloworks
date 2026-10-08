import Link from "next/link";
import { buttonClass } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto w-full max-w-xl flex-1 p-4 sm:p-8">
      <div className="space-y-4 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-card">
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="text-foreground-secondary">We could not find that page. It may have been moved, or the link is wrong.</p>
        <Link href="/requests" className={buttonClass({ variant: "primary" })}>
          Back to requests
        </Link>
      </div>
    </main>
  );
}
