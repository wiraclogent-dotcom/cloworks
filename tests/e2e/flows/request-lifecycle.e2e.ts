import { test } from "@e2e-dev/web";
import { expect } from "e2e";

// WRITES DATA: creates one request and walks it to Done, then cancels it so it leaves no KPI trace. Runs only against
// a local dev server with email off (e2e.config.ts starts `next dev` with RESEND_API_KEY/EMAIL_FROM empty).
test("create a request and walk it to Done", { session: "qa" }, async ({ app, screen, browser }) => {
  if (!/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\/?$/.test(app.baseUrl ?? "")) {
    throw new Error(`request lifecycle writes data; refusing to run against ${app.baseUrl}`);
  }
  const title = `[e2e] Request lifecycle ${Date.now()}`;

  // 1. Create
  await app.open("/requests/new");
  await screen.getByRole("radio", "Static design").tap();
  await screen.getByLabel(/^Brand/).selectOption({ index: 1 });
  await screen.getByLabel(/^Division/).selectOption({ index: 1 });
  await screen.getByLabel("Assignee").selectOption({ index: 1 });
  await screen.getByLabel(/^Title/).fill(title);
  await screen.getByRole("button", "Create request").tap();
  await expect(browser).toHaveURL(/\/requests(\?.*)?$/);

  // 2. Open it in the side panel
  await screen.getByRole("link", title).tap();
  const panel = screen.getByRole("dialog", { visible: true });
  await expect(panel.getByRole("heading", title)).toBeVisible();

  const moveTo = async (status: string) => {
    const select = panel.getByLabel("Move to…");
    await expect(select.getByRole("option", status)).toBeAttached();
    await select.selectOption({ label: status });
  };
  const expectStatus = (status: string) => expect(panel.getByText(status, { exact: true, visible: true }).first()).toBeVisible();

  // 3. Requested → On progress → First look → Done
  await expectStatus("Requested");
  await moveTo("On progress");
  await expectStatus("On progress");
  await moveTo("First look");
  await expectStatus("First look");
  await moveTo("Done");

  const done = screen.getByRole("dialog", "Mark as done");
  await expect(done).toBeVisible();
  await done.getByLabel(/^Number of outputs/).fill("2");
  await done.getByRole("button", "Mark as done").tap();
  await expect(done).toBeHidden();
  await expectStatus("Done");

  // 4. Clean up: cancel it (cancelled requests don't count toward KPI)
  await moveTo("Cancelled");
  await expectStatus("Cancelled");
});
