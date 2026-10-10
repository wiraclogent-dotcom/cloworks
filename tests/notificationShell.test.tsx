import { describe, it, expect, vi } from "vitest";
import { Children, isValidElement, type ReactNode } from "react";

vi.mock("next/navigation", () => ({ usePathname: () => "/requests", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/session", () => ({ requireUserOrRedirect: vi.fn(), requireScope: vi.fn() }));
vi.mock("@/lib/auth", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/app/(app)/notifications/actions", () => ({ listNotifications: vi.fn(), markNotificationRead: vi.fn(), markAllNotificationsRead: vi.fn() }));

import { AppShell } from "@/components/AppShell";
import { NotificationBell } from "@/components/shell/NotificationBell";
import { ProfileMenu } from "@/components/shell/ProfileMenu";

/** Every element in a tree, depth first, without rendering (the shell holds async server components). */
function walk(node: ReactNode, out: { type: unknown; props: Record<string, unknown> }[] = []) {
  Children.forEach(node, (c) => {
    if (!isValidElement(c)) return;
    const props = c.props as Record<string, unknown>;
    out.push({ type: c.type, props });
    walk(props.children as ReactNode, out);
  });
  return out;
}

describe("notification bell in the shell", () => {
  const frame = AppShell({ children: null }) as { props: { nav: ReactNode; profile: ReactNode } };

  it("the sidebar has no Notifications item any more", () => {
    expect(walk(frame.props.nav).map((e) => e.props.label)).not.toContain("Notifications");
  });

  it("the top-right slot shows the bell before the profile menu", () => {
    const types = walk(frame.props.profile).map((e) => e.type).filter((t) => t === NotificationBell || t === ProfileMenu);
    expect(types).toEqual([NotificationBell, ProfileMenu]);
  });
});
