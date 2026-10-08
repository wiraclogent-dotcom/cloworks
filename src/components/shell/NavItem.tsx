"use client";

import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeNavHref } from "@/lib/nav";
import { cn } from "@/components/ui/cn";
import { useSidebarCollapsed } from "./SidebarContext";

type Props = { href: string; label: string; icon: ReactNode };

function NavLinkView({ href, label, icon, active }: Props & { active: boolean }) {
  const collapsed = useSidebarCollapsed();
  return (
    <Link href={href} aria-current={active ? "page" : undefined} title={collapsed ? label : undefined}
      className={cn(
        "sb-item flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm transition-colors duration-150 ease-out",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring [&_svg]:size-[18px] [&_svg]:shrink-0",
        active
          ? "bg-sidebar-active font-medium text-sidebar-foreground [&_svg]:text-sidebar-accent"
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
 * Sidebar link: 36px, 8px radius; active = Aqua-tinted pill + Aqua icon + aria-current="page".
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
