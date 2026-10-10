import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * The raw, unscoped client. Use it only where a query must cross workspaces: sign-in (finding a user by email),
 * the password authenticator, seed and import scripts, and test helpers. Everything else uses `scopedDb`.
 */
export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export { CLOGENT_WORKSPACE_ID } from "./workspace";

/** Models whose rows carry `workspaceId`, by Prisma model name. `Workspace` itself is not scoped. */
const SCOPED_MODELS = new Set([
  "User", "AllowedEmail", "Brand", "Division", "RequestType", "Request", "StatusEvent", "DeadlineEvent", "Comment",
  "Attachment", "KpiTarget", "Notification", "ChatRead", "Project", "ProjectTask", "ProjectMilestone",
  "LibraryCategory", "LibraryItem",
]);

const WHERE_OPS = new Set([
  "findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany", "count", "aggregate", "groupBy",
  "update", "updateMany", "updateManyAndReturn", "delete", "deleteMany", "upsert",
]);
const CREATE_OPS = new Set(["create", "createMany", "createManyAndReturn"]);
/** Operations whose `data` may carry a `workspaceId` that must match the scope. */
const DATA_OPS = new Set(["update", "updateMany", "updateManyAndReturn"]);

type Rec = Record<string, unknown>;

/**
 * Wraps `base` so every query on a scoped model is confined to `workspaceId`: reads, updates and deletes get it
 * ANDed into `where`, creates get it stamped into `data`, and a `data.workspaceId` naming another workspace
 * throws. Nested writes inside `data` and `$queryRaw`/`$executeRaw` are NOT scoped.
 *
 * Limits: the `Workspace` model itself is not scoped (any scoped client can read or update it). Cross-workspace
 * scalar foreign keys (e.g. a `brandId` belonging to another workspace) are blocked neither by this extension nor by
 * the database, so callers must look referenced rows up through the scoped client first (as createRequest and
 * projects do).
 */
export function makeScoped(base: PrismaClient, workspaceId: string) {
  const check = (data: unknown) => {
    if (!data || typeof data !== "object") return;
    const value = (data as Rec).workspaceId;
    // `workspace: { connect: ... }` would move the row through the relation, so it is refused outright.
    if ((value !== undefined && value !== workspaceId) || (data as Rec).workspace !== undefined)
      throw new Error("Cross-workspace write blocked");
  };
  const stamp = (data: unknown): Rec => {
    check(data);
    return { ...(data as Rec), workspaceId };
  };

  return base.$extends({
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          if (!SCOPED_MODELS.has(model)) return query(args);
          const a = { ...(args as Rec) };
          if (WHERE_OPS.has(operation)) a.where = { ...(a.where as Rec | undefined), workspaceId };
          if (CREATE_OPS.has(operation)) a.data = Array.isArray(a.data) ? a.data.map(stamp) : stamp(a.data);
          if (DATA_OPS.has(operation)) check(a.data);
          if (operation === "upsert") {
            a.create = stamp(a.create);
            check(a.update);
          }
          return query(a as typeof args);
        },
      },
    },
  }) as unknown as PrismaClient;
  // Typed as PrismaClient: an extended client's own type is not assignable to PrismaClient (it lacks `$on`/`$use`
  // and its delegate generics differ), and every lib function takes `db: PrismaClient`. Only `$on`/`$use` are
  // missing at runtime, and nothing calls them on a scoped client.
}

export type ScopedDb = ReturnType<typeof makeScoped>;

const scopedClients = new Map<string, ScopedDb>();

/** The client for one workspace, built on the shared raw client and memoised per id. */
export function scopedDb(workspaceId: string): ScopedDb {
  let client = scopedClients.get(workspaceId);
  if (!client) {
    client = makeScoped(prisma, workspaceId);
    scopedClients.set(workspaceId, client);
  }
  return client;
}
