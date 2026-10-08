import { AccessDenied } from "@/components/AccessDenied";

/** Inline message for non-admins; rendered instead of (never alongside) any admin data. */
export function AdminDenied() {
  return <AccessDenied description="Admin pages are only available to admins." />;
}
