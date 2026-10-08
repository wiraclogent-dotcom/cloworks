"use client";

import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeNavHref } from "@/lib/nav";
import { cn } from "@/components/ui/cn";

type Props = { href: string; label: string; icon: ReactNode };

/**
 * `title` is always rendered (it is the rail's tooltip; CSS hides the label when collapsed). It must never depend on
 * the collapsed state: these links hydrate inside Suspense boundaries after the frame has switched to the stored rail
 * state, so a conditional prop differs from the server HTML (hydration mismatch; tests/shellHydration.test.tsx).
 */
function NavLinkView({ href, label, icon, active }: Props & { active: boolean }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} title={label}
      className={cn(
        "sb-item flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm transition-colors duration-150 ease-out",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring [&_svg]:size-[18px] [&_svg]:shrink-0",
        active
          ? "bg-sidebar-active font-medium text-sidebar-foreground shadow-card [&_svg]:text-sidebar-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-hover [&_svg]:text-sidebar-foreground-secondary hover:[&_svg]:text-sidebar-foreground",
      )}>
      {icon}
      <span className="sb-label truncate">{label}</span>
    </Link>
  );
}

function ActiveNavLink(props: Props) {
  return <NavLinkView {...props} active={activeNavHref(usePathname()) === props.href} />;
}

/**
 * Sidebar link: 36px, 8px radius; active = white pill with a card shadow + aria-current="page".
 * The pathname is request data (cacheComponents), so the active state streams in inside Suspense; the
 * prerendered fallback is the same link without the highlight.
 */
export function NavItem(props: Props) {
  return (
    <li>
      <Suspense fallback={<NavLinkView {...props} active={false} />}>
        <ActiveNavLink {...props} />
      </Suspense>
    </li>
  );
}
