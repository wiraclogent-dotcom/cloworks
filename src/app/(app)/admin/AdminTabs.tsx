import Link from "next/link";

export function AdminTabs({ current }: { current: "users" | "lists" }) {
  const cls = (on: boolean) =>
    `rounded-md px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-ring ${on ? "bg-secondary text-secondary-foreground" : "border border-border"}`;
  return (
    <nav aria-label="Admin" className="mb-4 flex gap-2">
      <Link href="/admin/users" className={cls(current === "users")} aria-current={current === "users" ? "page" : undefined}>People and access</Link>
      <Link href="/admin/lists" className={cls(current === "lists")} aria-current={current === "lists" ? "page" : undefined}>Brands, divisions, types</Link>
    </nav>
  );
}
