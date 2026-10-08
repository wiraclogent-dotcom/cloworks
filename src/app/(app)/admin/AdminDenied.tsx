/** Inline message for non-admins; rendered instead of (never alongside) any admin data. */
export function AdminDenied() {
  return (
    <div role="alert" className="rounded-md border border-border p-6">
      <h1 className="text-xl font-semibold">403 · Access denied</h1>
      <p className="text-muted-foreground">Admin pages are only available to admins.</p>
    </div>
  );
}
