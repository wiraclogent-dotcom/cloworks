import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 p-8">
      <div className="space-y-4 rounded-lg border border-border bg-card p-6 text-card-foreground">
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="text-muted-foreground">We could not find that page. It may have been moved, or the link is wrong.</p>
        <Link href="/requests" className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          Back to requests
        </Link>
      </div>
    </main>
  );
}
