import fs from "node:fs";
import readline from "node:readline";
import { PrismaClient } from "@prisma/client";
import { checkNewPassword, hashPassword } from "../src/lib/password";

// Sets a person's sign-in password straight in the database (for the first admin, before anyone can sign in).
// Usage: npm run set-password -- <login email>   (uses DATABASE_URL; the password is typed hidden, twice, or piped on stdin).
function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    let asked = false;
    out._writeToOutput = (s: string) => {
      if (!asked) {
        out.output.write(s);
        asked = true;
      }
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function readStdin(): Promise<string> {
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

async function main() {
  if (fs.existsSync(".env")) process.loadEnvFile(".env"); // does not override variables already in the environment
  const raw = process.argv.slice(2).filter((a) => a !== "--");
  if (raw.length !== 1) throw new Error("Usage: npm run set-password -- <login email>");
  const email = raw[0].trim().toLowerCase();

  const db = new PrismaClient();
  try {
    const user = await db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true, name: true, active: true } });
    if (!user) throw new Error(`No person has the login email ${email}.`);
    if (!user.active) throw new Error(`${user.name} is inactive.`);

    // Piped input (e.g. from a shell `read -s`) is used as-is; otherwise ask twice on the terminal.
    const piped = !process.stdin.isTTY;
    const password = piped ? (await readStdin()).replace(/\r?\n$/, "") : await askHidden(`New password for ${user.name}: `);
    const problem = checkNewPassword(password);
    if (problem) throw new Error(problem);
    if (!piped && (await askHidden("Type it again: ")) !== password) throw new Error("The passwords don't match.");

    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(password), passwordVersion: { increment: 1 }, failedLogins: 0, lockedUntil: null },
    });
    console.log(`Password set for ${user.name}. They can now sign in with ${email}.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
