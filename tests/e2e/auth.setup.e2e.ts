import { test } from "@e2e-dev/web";
import { credentials, expect } from "e2e";

// Signs in once with the local QA account; every other test restores the "qa" session.
test.setup("sign in as the QA account", { sessions: ["qa"] }, async ({ app, screen, browser, session }) => {
  const qa = credentials.user("qa");

  await app.open("/signin");
  await screen.getByLabel("Email").fill(qa.username);
  await screen.getByLabel("Password").fill(qa.password);
  await screen.getByRole("button", "Sign in").tap();

  await expect(browser).toHaveURL(/\/(requests|dashboard)/);
  await expect(screen.getByRole("button", /^Account menu for /, { visible: true })).toBeVisible();

  await session.save("qa");
});
