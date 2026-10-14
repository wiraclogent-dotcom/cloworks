import { test } from "@e2e-dev/web";
import { expect } from "e2e";

// Agent steps: need a model (CMD_API_KEY, see e2e.config.ts). Read-only: the agent only filters and views.
test("agent narrows the requests to work that needs motion", { session: "qa" }, async ({ app, agent, browser }) => {
  await app.open("/requests");

  await agent.act("show the requests as a table, then use the Filters panel to keep only requests that need motion");
  await expect(browser).toHaveURL(/view=table/);
  await expect(browser).toHaveURL(/motion=yes/);

  await agent.assert("every row in the table is marked as needing motion, or the table says there are no matching requests");
});
