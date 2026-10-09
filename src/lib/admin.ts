import { Prisma, AppRole as AppRoleEnum, JobRole as JobRoleEnum, type AppRole, type JobRole, type PrismaClient } from "@prisma/client";
import { can } from "./permissions";
import { fieldSchemaSchema } from "./fieldSchema";
import { DEFAULT_ALLOWED_DOMAIN, isAllowedEmail } from "./signin";
import { normalizeName } from "./import/aliases";
import { checkNewPassword, hashPassword, verifyPassword } from "./password";

export type AdminErrorCode = "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "LAST_ADMIN";

export class AdminError extends Error {
  constructor(
    public code: AdminErrorCode,
    message: string,
    public details?: string[],
  ) {
    super(message);
    this.name = "AdminError";
  }
}

export type Actor = { id: string; appRole: AppRole };
type Db = PrismaClient;
type Tx = Prisma.TransactionClient;

const MAX_ALIASES = 20;
const MAX_ALIAS_LEN = 50;
const MAX_NAME_LEN = 100;
const MAX_LIST_NAME = 60;

function assertAdmin(actor: Actor) {
  if (!actor || !can(actor.appRole, "admin.manage")) throw new AdminError("FORBIDDEN", "Only admins can do this");
}

const norm = (s: string) => s.trim().replace(/\s+/g, " ");

function companyDomain() {
  return (process.env.ALLOWED_EMAIL_DOMAIN || DEFAULT_ALLOWED_DOMAIN).trim().toLowerCase();
}

/** Normalised email, or throws VALIDATION: exactly one @, no whitespace, <= 254 chars. */
export function normalizeEmail(raw: string): string {
  const e = (raw ?? "").trim().toLowerCase();
  const parts = e.split("@");
  if (!e || e.length > 254 || /\s/.test(e) || parts.length !== 2 || !parts[0] || !parts[1])
    throw new AdminError("VALIDATION", "Enter a valid email address (one @, no spaces, at most 254 characters)");
  return e;
}

/** Trims and dedupes aliases; silently drops any that normalise to one of `own` (the person's own name/fullName). */
function cleanAliases(raw: string[], own: string[] = []): string[] {
  const ownKeys = new Set(own.map(normalizeName));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of raw) {
    const v = norm(a);
    if (v.length < 1 || v.length > MAX_ALIAS_LEN) throw new AdminError("VALIDATION", `Each alias must be 1 to ${MAX_ALIAS_LEN} characters`);
    if (ownKeys.has(normalizeName(v)) || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
  }
  if (out.length > MAX_ALIASES) throw new AdminError("VALIDATION", `At most ${MAX_ALIASES} aliases`);
  return out;
}

function cleanName(raw: string, label: string, max = MAX_NAME_LEN): string {
  const v = norm(raw ?? "");
  if (v.length < 1 || v.length > max) throw new AdminError("VALIDATION", `${label} must be 1 to ${max} characters`);
  return v;
}

/** Serialises every roster mutation that can change who the admins are (released at commit). */
async function lockRoster(tx: Tx) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(7312001)`;
}

/**
 * Mirrors the import resolver (normalizeName over name, fullName and aliases): throws CONFLICT when any candidate
 * collides with ANOTHER user's name, fullName or alias.
 */
async function assertNoCollision(tx: Tx, candidates: string[], excludeId: string | null) {
  if (!candidates.length) return;
  const wanted = new Map<string, string>();
  for (const c of candidates) {
    const k = normalizeName(c);
    if (!k) throw new AdminError("VALIDATION", `"${c}" must contain letters or numbers`);
    wanted.set(k, c);
  }
  const others = await tx.user.findMany({
    where: excludeId ? { id: { not: excludeId } } : {},
    select: { name: true, fullName: true, aliases: true },
  });
  for (const o of others) {
    for (const v of [o.name, o.fullName, ...o.aliases]) {
      const hit = wanted.get(normalizeName(v));
      if (hit) throw new AdminError("CONFLICT", `"${hit}" is already used by ${o.name}`);
    }
  }
}

/** The user's own name, fullName and aliases must not collide (name equal to fullName is fine). */
function assertOwnDistinct(name: string, fullName: string, aliases: string[]) {
  const base = new Set([normalizeName(name), normalizeName(fullName)]);
  const seen = new Set<string>();
  for (const a of aliases) {
    const k = normalizeName(a);
    if (base.has(k) || seen.has(k)) throw new AdminError("VALIDATION", `Alias "${a}" duplicates another name or alias of this person`);
    seen.add(k);
  }
}

function assertRoles(appRole: unknown, jobRole: unknown) {
  if (appRole !== undefined && !Object.values(AppRoleEnum).includes(appRole as AppRole))
    throw new AdminError("VALIDATION", `Unknown app role "${String(appRole)}"`);
  if (jobRole !== undefined && !Object.values(JobRoleEnum).includes(jobRole as JobRole))
    throw new AdminError("VALIDATION", `Unknown job role "${String(jobRole)}"`);
}

/**
 * Active admins who can actually sign in: have an email that sign-in would accept (company domain or on the allow list).
 * Run under the roster lock.
 */
export async function countSignInCapableAdmins(tx: Tx, excludeUserId?: string): Promise<number> {
  const [admins, rows] = await Promise.all([
    tx.user.findMany({
      where: { appRole: "ADMIN", active: true, email: { not: null }, ...(excludeUserId ? { id: { not: excludeUserId } } : {}) },
      select: { email: true },
    }),
    tx.allowedEmail.findMany({ select: { email: true } }),
  ]);
  const allow = rows.map((r) => r.email);
  const domain = companyDomain();
  return admins.filter((a) => a.email && isAllowedEmail(a.email, domain, allow)).length;
}

function mapUnique(e: unknown, message: string): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AdminError("CONFLICT", message);
  throw e;
}

export type UserPatch = {
  appRole?: AppRole;
  jobRole?: JobRole;
  aliases?: string[];
  active?: boolean;
  fullName?: string;
  title?: string | null;
  department?: string | null;
};

export async function updateUser(db: Db, actor: Actor, userId: string, patch: UserPatch) {
  assertAdmin(actor);
  assertRoles(patch.appRole, patch.jobRole);
  const data: Prisma.UserUpdateInput = {};
  if (patch.appRole !== undefined) data.appRole = patch.appRole;
  if (patch.jobRole !== undefined) data.jobRole = patch.jobRole;
  if (patch.active !== undefined) data.active = patch.active;
  const rawAliases = patch.aliases !== undefined ? cleanAliases(patch.aliases) : undefined;
  const fullName = patch.fullName !== undefined ? cleanName(patch.fullName, "Full name") : undefined;
  if (fullName !== undefined) data.fullName = fullName;
  if (patch.title !== undefined) data.title = patch.title === null ? null : norm(patch.title) || null;
  if (patch.department !== undefined) data.department = patch.department === null ? null : norm(patch.department) || null;

  return db.$transaction(async (tx) => {
    await lockRoster(tx);
    const target = await tx.user.findUnique({ where: { id: userId } });
    if (!target) throw new AdminError("NOT_FOUND", "User not found");
    const wasActiveAdmin = target.appRole === "ADMIN" && target.active;
    const willBeActiveAdmin = (patch.appRole ?? target.appRole) === "ADMIN" && (patch.active ?? target.active);
    if (wasActiveAdmin && !willBeActiveAdmin) {
      if ((await countSignInCapableAdmins(tx, target.id)) === 0)
        throw new AdminError("LAST_ADMIN", "There must always be at least one active admin who can sign in");
    }
    // The edit form always posts fullName and aliases, so only values that actually CHANGED are collision-checked;
    // a pre-existing collision must not block an unrelated edit (e.g. a role change).
    const effectiveFullName = fullName ?? target.fullName;
    const aliases = rawAliases ? cleanAliases(rawAliases, [target.name, effectiveFullName]) : undefined;
    const storedAliasKeys = new Set(target.aliases.map(normalizeName));
    const changedAliases = aliases ? aliases.filter((a) => !storedAliasKeys.has(normalizeName(a))) : [];
    const fullNameChanged = fullName !== undefined && normalizeName(fullName) !== normalizeName(target.fullName);
    if (changedAliases.length || fullNameChanged) {
      assertOwnDistinct(target.name, effectiveFullName, aliases ?? target.aliases);
      await assertNoCollision(tx, [...changedAliases, ...(fullNameChanged ? [fullName!] : [])], target.id);
    }
    if (aliases) data.aliases = aliases;
    return tx.user.update({ where: { id: userId }, data });
  });
}

export type NewUserInput = {
  name: string;
  fullName?: string;
  title?: string;
  jobRole: JobRole;
  appRole: AppRole;
  aliases?: string[];
  department?: string;
};

/** Roster record WITHOUT a login email (bind one later with setUserLoginEmail). */
export async function createUser(db: Db, actor: Actor, input: NewUserInput) {
  assertAdmin(actor);
  assertRoles(input.appRole ?? null, input.jobRole ?? null);
  const name = cleanName(input.name, "Name");
  const fullName = input.fullName?.trim() ? cleanName(input.fullName, "Full name") : name;
  const aliases = cleanAliases(input.aliases ?? [], [name, fullName]);
  const title = input.title?.trim() ? norm(input.title) : null;
  const department = input.department?.trim() ? norm(input.department) : null;
  return db.$transaction(async (tx) => {
    await lockRoster(tx);
    assertOwnDistinct(name, fullName, aliases);
    await assertNoCollision(tx, [name, fullName, ...aliases], null);
    return tx.user.create({
      data: { name, fullName, title, department, jobRole: input.jobRole, appRole: input.appRole, aliases, email: null },
    });
  });
}

/** Binds (or clears) the login email in one transaction, keeping AllowedEmail consistent. */
export async function setUserLoginEmail(db: Db, actor: Actor, userId: string, email: string | null) {
  assertAdmin(actor);
  const next = email === null ? null : normalizeEmail(email);
  try {
    return await db.$transaction(async (tx) => {
      await lockRoster(tx);
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new AdminError("NOT_FOUND", "User not found");
      const old = user.email?.trim().toLowerCase() ?? null;
      const capableBefore = user.appRole === "ADMIN" && user.active ? await countSignInCapableAdmins(tx) : 0;
      if (next) {
        const clash = await tx.user.findFirst({ where: { id: { not: userId }, email: { equals: next, mode: "insensitive" } }, select: { name: true } });
        if (clash) throw new AdminError("CONFLICT", `${next} is already the login email of ${clash.name}`);
      }
      const updated = await tx.user.update({ where: { id: userId }, data: { email: next } });
      if (old && old !== next) {
        const stillUsed = await tx.user.count({ where: { id: { not: userId }, email: { equals: old, mode: "insensitive" } } });
        if (!stillUsed) await tx.allowedEmail.deleteMany({ where: { email: { equals: old, mode: "insensitive" } } });
      }
      if (next && !isAllowedEmail(next, companyDomain(), [])) {
        await tx.allowedEmail.upsert({
          where: { email: next },
          create: { email: next, note: `login for ${user.name}` },
          update: {},
        });
      }
      if (capableBefore > 0 && (await countSignInCapableAdmins(tx)) === 0)
        throw new AdminError("LAST_ADMIN", "That would leave no active admin who can sign in");
      return updated;
    });
  } catch (e) {
    return mapUnique(e, "That email is already in use");
  }
}

/** Admin sets (or resets) someone's sign-in password. Ends their existing sessions and clears any lockout. */
export async function setUserPassword(db: Db, actor: Actor, userId: string, password: string) {
  assertAdmin(actor);
  const problem = checkNewPassword(password);
  if (problem) throw new AdminError("VALIDATION", problem);
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) throw new AdminError("NOT_FOUND", "User not found");
  if (!user.email) throw new AdminError("VALIDATION", "Set their login email first.");
  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password), passwordVersion: { increment: 1 }, failedLogins: 0, lockedUntil: null },
  });
}

/** A signed-in person changes their own password; the current one must match. Ends their existing sessions. */
export async function changeOwnPassword(db: Db, userId: string, current: string, next: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user) throw new AdminError("NOT_FOUND", "User not found");
  if (!user.passwordHash) throw new AdminError("VALIDATION", "You don't have a password yet. Ask an admin to set one.");
  if (!(await verifyPassword(current, user.passwordHash))) throw new AdminError("VALIDATION", "Current password is incorrect.");
  const problem = checkNewPassword(next);
  if (problem) throw new AdminError("VALIDATION", problem);
  if (next === current) throw new AdminError("VALIDATION", "Choose a password different from the current one.");
  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(next), passwordVersion: { increment: 1 }, failedLogins: 0, lockedUntil: null },
  });
}

export async function addAllowedEmail(db: Db, actor: Actor, email: string, note?: string) {
  assertAdmin(actor);
  const e = normalizeEmail(email);
  const n = note?.trim() ? note.trim().slice(0, 200) : undefined;
  return db.allowedEmail.upsert({ where: { email: e }, create: { email: e, note: n ?? null }, update: n !== undefined ? { note: n } : {} });
}

/** Idempotent. Sessions of users relying on this row end on their next request (session-core). */
export async function removeAllowedEmail(db: Db, actor: Actor, email: string) {
  assertAdmin(actor);
  const e = normalizeEmail(email);
  await db.$transaction(async (tx) => {
    await lockRoster(tx);
    const before = await countSignInCapableAdmins(tx);
    await tx.allowedEmail.deleteMany({ where: { email: { equals: e, mode: "insensitive" } } });
    if (before > 0 && (await countSignInCapableAdmins(tx)) === 0)
      throw new AdminError("LAST_ADMIN", "That would leave no active admin who can sign in");
  });
}

type NamedDelegate = "brand" | "division";

async function createNamed(db: Db, kind: NamedDelegate, label: string, name: string) {
  const n = cleanName(name, label, MAX_LIST_NAME);
  try {
    return await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7312002)`;
      const dup = await (tx[kind] as Tx["brand"]).findFirst({ where: { name: { equals: n, mode: "insensitive" } }, select: { name: true } });
      if (dup) throw new AdminError("CONFLICT", `${label} "${dup.name}" already exists`);
      return (tx[kind] as Tx["brand"]).create({ data: { name: n } });
    });
  } catch (e) {
    return mapUnique(e, `${label} "${n}" already exists`);
  }
}

async function renameNamed(db: Db, kind: NamedDelegate, label: string, id: string, name: string) {
  const n = cleanName(name, label, MAX_LIST_NAME);
  try {
    return await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7312002)`;
      const d = tx[kind] as Tx["brand"];
      if (!(await d.findUnique({ where: { id }, select: { id: true } }))) throw new AdminError("NOT_FOUND", `${label} not found`);
      const dup = await d.findFirst({ where: { id: { not: id }, name: { equals: n, mode: "insensitive" } }, select: { name: true } });
      if (dup) throw new AdminError("CONFLICT", `${label} "${dup.name}" already exists`);
      return d.update({ where: { id }, data: { name: n } });
    });
  } catch (e) {
    return mapUnique(e, `${label} "${n}" already exists`);
  }
}

export async function createBrand(db: Db, actor: Actor, name: string) {
  assertAdmin(actor);
  return createNamed(db, "brand", "Brand", name);
}
export async function renameBrand(db: Db, actor: Actor, id: string, name: string) {
  assertAdmin(actor);
  return renameNamed(db, "brand", "Brand", id, name);
}
export async function createDivision(db: Db, actor: Actor, name: string) {
  assertAdmin(actor);
  return createNamed(db, "division", "Division", name);
}
export async function renameDivision(db: Db, actor: Actor, id: string, name: string) {
  assertAdmin(actor);
  return renameNamed(db, "division", "Division", id, name);
}

/** Validates a field schema; returns friendly messages (empty when valid). */
export function fieldSchemaProblems(raw: unknown): string[] {
  const r = fieldSchemaSchema.safeParse(raw);
  if (!r.success)
    return r.error.issues.map((i) => {
      const where = i.path.length ? `Field ${typeof i.path[0] === "number" ? i.path[0] + 1 : String(i.path[0])}${i.path.length > 1 ? ` › ${i.path.slice(1).join(".")}` : ""}` : "Schema";
      return `${where}: ${i.message}`;
    });
  const problems: string[] = [];
  const keys = new Set<string>();
  r.data.forEach((f, i) => {
    if (keys.has(f.key)) problems.push(`Field ${i + 1}: key "${f.key}" is used more than once`);
    keys.add(f.key);
    if (f.type === "select" && !(f.options && f.options.length)) problems.push(`Field ${i + 1} (${f.key}): a select needs at least one option`);
  });
  return problems;
}

export async function upsertRequestType(db: Db, actor: Actor, input: { id?: string; name: string; fieldSchema: unknown; active: boolean }) {
  assertAdmin(actor);
  const name = cleanName(input.name, "Name", MAX_LIST_NAME);
  const problems = fieldSchemaProblems(input.fieldSchema);
  if (problems.length) throw new AdminError("VALIDATION", `Field schema is invalid: ${problems[0]}`, problems);
  const fieldSchema = input.fieldSchema as Prisma.InputJsonValue;
  try {
    return await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7312003)`;
      if (input.id && !(await tx.requestType.findUnique({ where: { id: input.id }, select: { id: true } })))
        throw new AdminError("NOT_FOUND", "Request type not found");
      const dup = await tx.requestType.findFirst({
        where: { name: { equals: name, mode: "insensitive" }, ...(input.id ? { id: { not: input.id } } : {}) },
        select: { name: true },
      });
      if (dup) throw new AdminError("CONFLICT", `Request type "${dup.name}" already exists`);
      return input.id
        ? tx.requestType.update({ where: { id: input.id }, data: { name, fieldSchema, active: input.active } })
        : tx.requestType.create({ data: { name, fieldSchema, active: input.active } });
    });
  } catch (e) {
    return mapUnique(e, `Request type "${name}" already exists`);
  }
}
