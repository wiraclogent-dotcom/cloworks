import { test } from "@e2e-dev/web";
import { expect } from "e2e";

// The mobile drawer (Sheet side="left"): opens from the menu button, closes on Escape, focus goes back.
test("mobile navigation drawer", { session: "qa" }, async ({ app, screen, browser }) => {
  await browser.setViewport({ width: 390, height: 844 });
  await app.open("/requests");

  const menu = screen.getByRole("button", "Open navigation");
  await menu.tap();
  const drawer = screen.getByRole("dialog", { visible: true });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("link", "Projects")).toBeVisible();

  await browser.keyboard.press("Escape");
  await expect(screen.getByRole("dialog", { visible: true })).toBeHidden();
  await expect(menu).toBeFocused();
});
