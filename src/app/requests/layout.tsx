import { AppShell } from "@/components/AppShell";

export default function RequestsLayout({ children }: LayoutProps<"/requests">) {
  return <AppShell>{children}</AppShell>;
}
