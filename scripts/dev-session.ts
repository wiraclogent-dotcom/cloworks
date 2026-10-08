import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { assertDevSessionAllowed, assertLocalDatabase, mintSessionToken, normalizeEmail, sessionCookieName } from "../src/lib/devSession";

// LOCAL manual/browser QA only: mints a session cookie for an existing user. Refuses anything but a localhost setup.
async function main() {
  if (fs.existsSync(".env")) process.loadEnvFile(".env"); // does not override variables already in the environment
  const raw = process.argv.slice(2).filter((a) => a !== "--");
  if (raw.length !== 1) throw new Error("Usage: npm run dev:session -- <email>");
  const { secret, baseUrl } = assertDevSessionAllowed(process.env);
  assertLocalDatabase(process.env);
  const email = normalizeEmail(raw[0]);

  const db = new PrismaClient();
  try {
    const candidates = await db.user.findMany({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true, name: true, email: true, appRole: true, jobRole: true, active: true },
    });
    const user = candidates.find((u) => u.email && normalizeEmail(u.email) === email);
    if (!user) throw new Error(`No user with email ${email} in this database. Add them via /admin/users first.`);
    if (!user.active) throw new Error(`${email} is inactive; the app would reject the session.`);

    const cookieName = sessionCookieName(baseUrl);
    const value = await mintSessionToken(user, secret, cookieName);
    console.log(`User:   ${user.name} <${email}> (${user.appRole}/${user.jobRole})`);
    console.log(`Cookie: ${cookieName}`);
    console.log(`Value:  ${value}`);
    console.log(`\nIn the browser at ${new URL(baseUrl).origin}: DevTools > Application > Cookies, add "${cookieName}" with the value above (Path=/, HttpOnly optional), then reload. Valid for 24h; local QA only.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(`ERROR: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
