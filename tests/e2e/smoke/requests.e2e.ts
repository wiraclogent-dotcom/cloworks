import { test } from "@e2e-dev/web";
import { expect } from "e2e";

// Read-only smoke checks of the shadcn-first UI: nothing here creates, edits or deletes data.

test("requests page: header, view switch and new-request link", { session: "qa" }, async ({ app, screen, browser }) => {
  await app.open("/requests");

  await expect(screen.getByRole("heading", "Requests", { level: 1 })).toBeVisible();
  await expect(screen.getByRole("link", "New request")).toBeVisible();

  await screen.getByRole("link", "Table").tap();
  await expect(browser).toHaveURL(/view=table/);
  await expect(screen.getByRole("table")).toBeVisible();

  await screen.getByRole("link", "Board").tap();
  await expect(browser).not.toHaveURL(/view=table/);
});

test("filters popover opens, closes on Escape and returns focus", { session: "qa" }, async ({ app, screen, browser }) => {
  await app.open("/requests");

  const trigger = screen.getByRole("button", /^Filters/);
  await trigger.tap();
  await expect(screen.getByRole("dialog", "Filters")).toBeVisible();

  await browser.keyboard.press("Escape");
  await expect(screen.getByRole("dialog", "Filters")).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("request panel opens from the board and Escape goes back", { session: "qa" }, async ({ app, screen, browser }) => {
  await app.open("/requests");

  const card = browser.locator('a[href^="/requests/"]:not([href="/requests/new"])').first();
  await card.tap();

  await expect(browser).toHaveURL(/\/requests\/[^/?]+$/);
  await expect(screen.getByRole("dialog", { visible: true })).toBeVisible();

  await browser.keyboard.press("Escape");
  await expect(browser).toHaveURL(/\/requests(\?.*)?$/);
  await expect(screen.getByRole("dialog", { visible: true })).toBeHidden();
});

test("account menu opens and closes", { session: "qa" }, async ({ app, screen, browser }) => {
  await app.open("/requests");

  const trigger = screen.getByRole("button", /^Account menu for /, { visible: true });
  await trigger.tap();
  await expect(screen.getByRole("menu")).toBeVisible();
  await expect(screen.getByRole("menuitem", /settings/i)).toBeVisible();

  await browser.keyboard.press("Escape");
  await expect(screen.getByRole("menu")).toBeHidden();
  await expect(trigger).toBeFocused();
});
