// @vitest-environment jsdom
/**
 * Regression: the sidebar nav links rendered `title={collapsed ? label : undefined}` from a context fed by
 * `<html data-sidebar>`. The server always renders "expanded"; links inside Suspense boundaries (Team KPI, Admin, and
 * every NavItem's pathname boundary) hydrate AFTER the root has re-rendered with the client value, so their first client
 * render had `title="Admin"` while the server HTML had none → React hydration mismatch on every page (seen in a real
 * browser). The first client render of every shell element must equal the server HTML whatever the stored rail state.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { Suspense, act, use, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";
import { ShieldCheck, SquareKanban, Users } from "lucide-react";

vi.mock("next/navigation", () => ({ usePathname: () => "/admin/users" }));

import { AppFrame } from "@/components/shell/AppFrame";
import { NavItem } from "@/components/shell/NavItem";
import { ThemeSwitch } from "@/components/ui/ThemeSwitch";
import { UserChipView } from "@/components/shell/UserChipView";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

/**
 * Simulates streaming: on the server the content is rendered inline; on the client it suspends until `release()` so the
 * boundary hydrates after the root has committed (as the RSC payload for a per-user boundary arrives later in Next).
 */
let gate: { promise: Promise<void>; release: () => void } | null = null;
function newGate() {
  let release = () => {};
  const promise = new Promise<void>((r) => { release = r; });
  gate = { promise, release };
}
function Streamed({ children }: { children: ReactNode }) {
  if (gate) use(gate.promise);
  return <>{children}</>;
}

function Shell() {
  return (
    <AppFrame
      nav={
        <nav aria-label="Main">
          <ul>
            <NavItem href="/requests" label="Requests" icon={<SquareKanban aria-hidden="true" />} />
            {/* Same shape as AppShell: role-gated items stream in their own Suspense boundary. */}
            <Suspense fallback={null}><Streamed><NavItem href="/dashboard/team" label="Team KPI" icon={<Users aria-hidden="true" />} /></Streamed></Suspense>
          </ul>
          <Suspense fallback={null}>
            <Streamed><ul><NavItem href="/admin/users" label="Admin" icon={<ShieldCheck aria-hidden="true" />} /></ul></Streamed>
          </Suspense>
        </nav>
      }
      footer={
        <>
          <Suspense fallback={null}><Streamed><UserChipView name="Wira Budi" roleLabel="Admin" /></Streamed></Suspense>
          <Suspense fallback={null}><Streamed><ThemeSwitch tone="sidebar" /></Streamed></Suspense>
        </>
      }>
      <h1>Page</h1>
    </AppFrame>
  );
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const html = () => document.documentElement;
let root: Root | null = null;
let container: HTMLDivElement;

beforeEach(() => {
  localStorage.clear();
  html().removeAttribute("data-sidebar");
  html().removeAttribute("data-theme");
  container = document.createElement("div");
  document.body.appendChild(container);
});
afterEach(async () => {
  gate = null;
  await act(async () => root?.unmount());
  root = null;
  container.remove();
  vi.restoreAllMocks();
});

async function hydrateWithStoredPrefs(prefs: Record<string, string>) {
  // Server render: no localStorage, no data-sidebar (server snapshot = expanded, light).
  gate = null;
  const serverHtml = renderToString(<Shell />);
  newGate();
  // Browser: the stored prefs exist and the blocking boot script has already applied them before React runs.
  for (const [k, v] of Object.entries(prefs)) localStorage.setItem(k, v);
  new Function(THEME_INIT_SCRIPT)();
  container.innerHTML = serverHtml;
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const recoverable: unknown[] = [];
  await act(async () => {
    root = hydrateRoot(container, <Shell />, { onRecoverableError: (e) => recoverable.push(e) });
  });
  // The root has committed (and re-rendered with the client prefs); now the streamed boundaries arrive and hydrate.
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  await act(async () => { gate!.release(); await gate!.promise; });
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return { errors, recoverable };
}

describe("app shell hydration", () => {
  it("no hydration error when the rail is stored as collapsed", async () => {
    const { errors, recoverable } = await hydrateWithStoredPrefs({ "ct-sidebar": "collapsed" });
    expect(html().getAttribute("data-sidebar")).toBe("collapsed");
    expect(errors.mock.calls.map((c) => String(c[0]))).toEqual([]);
    expect(recoverable).toEqual([]);
    // After hydration the client state is applied (collapse button reflects the stored rail).
    expect(container.querySelector('button[aria-label="Expand sidebar"]')).not.toBeNull();
    // Tooltips are always present (CSS decides what is visible), so they never differ between server and client.
    for (const name of ["Requests", "Team KPI", "Admin"]) {
      const link = [...container.querySelectorAll("a")].find((a) => a.textContent === name)!;
      expect(link.getAttribute("title")).toBe(name);
    }
  });

  it("no hydration error with a stored dark theme (theme switch) and collapsed rail together", async () => {
    const { errors, recoverable } = await hydrateWithStoredPrefs({ "ct-sidebar": "collapsed", "ct-theme": "dark" });
    expect(errors.mock.calls.map((c) => String(c[0]))).toEqual([]);
    expect(recoverable).toEqual([]);
    expect(html().getAttribute("data-theme")).toBe("dark");
    expect(container.querySelector('button[aria-pressed="true"]')?.textContent).toBe("Dark");
  });

  it("no hydration error with no stored choice at a rail-default width (768–1279px)", async () => {
    window.matchMedia = vi.fn().mockImplementation((q: string) => ({
      matches: q.includes("1279.98px"), media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    const { errors, recoverable } = await hydrateWithStoredPrefs({});
    expect(errors.mock.calls.map((c) => String(c[0]))).toEqual([]);
    expect(recoverable).toEqual([]);
    expect(html().hasAttribute("data-sidebar")).toBe(false);
    expect(container.querySelector('button[aria-label="Expand sidebar"]')).not.toBeNull();
    // @ts-expect-error jsdom has no matchMedia by default; remove the mock again.
    delete window.matchMedia;
  });

  it("no hydration error with default prefs (user chip, expanded rail)", async () => {
    const { errors } = await hydrateWithStoredPrefs({});
    expect(errors.mock.calls.map((c) => String(c[0]))).toEqual([]);
    expect(container.querySelector('[title="Wira Budi"]')).not.toBeNull();
  });
});
