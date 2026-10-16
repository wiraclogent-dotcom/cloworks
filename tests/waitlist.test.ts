import { describe, it, expect, vi } from "vitest";
import {
  joinWaitlistWith, waitlistSuccess, setWaitlistStatus, listWaitlist, deleteWaitlistEntry, NOTIFY_CAP_PER_HOUR, WAITLIST_SIZES,
  type WaitlistDeps,
} from "@/lib/waitlist";

type Row = { id: string; email: string; team: string; teamSize: string; status: string; contactedAt: Date | null; createdAt: Date };

/** In-memory stand-in for the `waitlistEntry` delegate. */
function fakeDb(opts: { createError?: unknown } = {}) {
  const rows: Row[] = [];
  let seq = 0;
  const waitlistEntry = {
    create: vi.fn(async ({ data }: { data: { email: string; team: string; teamSize: string; createdAt?: Date } }) => {
      if (opts.createError) throw opts.createError;
      if (rows.some((r) => r.email === data.email)) throw { code: "P2002" };
      const row: Row = { id: `w${++seq}`, status: "NEW", contactedAt: null, createdAt: data.createdAt ?? new Date(), ...data };
      rows.push(row);
      return row;
    }),
    count: vi.fn(async ({ where }: { where: { createdAt: { gte: Date } } }) => rows.filter((r) => r.createdAt >= where.createdAt.gte).length),
    findMany: vi.fn(async ({ orderBy }: { orderBy: { createdAt: "desc" } }) => {
      expect(orderBy).toEqual({ createdAt: "desc" });
      return [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
      const r = rows.find((x) => x.id === where.id)!;
      Object.assign(r, data);
      return r;
    }),
    delete: vi.fn(async ({ where }: { where: { id: string } }) => {
      rows.splice(rows.findIndex((x) => x.id === where.id), 1);
    }),
  };
  return { rows, waitlistEntry };
}

const NOW = new Date("2026-10-16T12:00:00Z");

function setup(opts: { createError?: unknown } = {}) {
  const db = fakeDb(opts);
  const notify = vi.fn();
  const deps = { db: db as unknown as WaitlistDeps["db"], notify, now: () => NOW } satisfies WaitlistDeps;
  return { db, notify, deps };
}

function form(o: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const v = { email: "ana@team.co", team: "Acme", teamSize: "SIZE_6_15", ...o };
  for (const [k, val] of Object.entries(v)) fd.set(k, val);
  return fd;
}

describe("joinWaitlistWith", () => {
  it("honeypot: website filled → success message, no row, notify not called", async () => {
    const { db, notify, deps } = setup();
    const r = await joinWaitlistWith(deps, form({ website: "http://spam.example" }));
    expect(r.info).toBe(waitlistSuccess("ana@team.co"));
    expect(r.error).toBeUndefined();
    expect(db.rows).toHaveLength(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it("stores a normalised email", async () => {
    const { db, notify, deps } = setup();
    const r = await joinWaitlistWith(deps, form({ email: "  Ana@Team.co " }));
    expect(db.rows.map((x) => x.email)).toEqual(["ana@team.co"]);
    expect(r.info).toBe(waitlistSuccess("ana@team.co"));
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith({ email: "ana@team.co", team: "Acme", teamSize: "SIZE_6_15" });
  });

  it("duplicate email, any case → same success, one row, notify once", async () => {
    const { db, notify, deps } = setup();
    const a = await joinWaitlistWith(deps, form());
    const b = await joinWaitlistWith(deps, form({ email: "ANA@team.co" }));
    expect(b.info).toBe(a.info);
    expect(b.info).toBe(waitlistSuccess("ana@team.co"));
    expect(db.rows).toHaveLength(1);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  describe("validation", () => {
    it.each([
      ["email without @", { email: "ana.team.co" }, "Enter your work email.", { email: "ana.team.co", team: "Acme", teamSize: "SIZE_6_15" }],
      ["empty team", { team: "   " }, "Enter your team or company name.", { email: "ana@team.co", team: "", teamSize: "SIZE_6_15" }],
      ["team over 120 characters", { team: "x".repeat(121) }, "Enter your team or company name.", { email: "ana@team.co", team: "", teamSize: "SIZE_6_15" }],
      ["unknown size", { teamSize: "HUGE" }, "Choose your team size.", { email: "ana@team.co", team: "Acme", teamSize: "" }],
    ])("%s", async (_name, over, message, values) => {
      const { db, notify, deps } = setup();
      const r = await joinWaitlistWith(deps, form(over));
      expect(r.error).toBe(message);
      expect(r.values).toEqual(values);
      expect(db.rows).toHaveLength(0);
      expect(notify).not.toHaveBeenCalled();
    });

    it("requires a dot after the @", async () => {
      const { deps } = setup();
      const r = await joinWaitlistWith(deps, form({ email: "ana@team" }));
      expect(r.error).toBe("Enter your work email.");
    });
  });

  it("notification cap: the 21st sign-up in an hour is stored, notify not called", async () => {
    const { db, notify, deps } = setup();
    for (let i = 0; i < NOTIFY_CAP_PER_HOUR; i++) {
      db.rows.push({ id: `old${i}`, email: `old${i}@x.co`, team: "T", teamSize: "SIZE_1_5", status: "NEW", contactedAt: null, createdAt: new Date(NOW.getTime() - 60_000) });
    }
    const r = await joinWaitlistWith(deps, form());
    expect(r.info).toBe(waitlistSuccess("ana@team.co"));
    expect(db.rows).toHaveLength(NOTIFY_CAP_PER_HOUR + 1);
    expect(notify).not.toHaveBeenCalled();
  });

  it("notification cap: the 20th sign-up still notifies, and rows older than an hour do not count", async () => {
    const { db, notify, deps } = setup();
    for (let i = 0; i < 30; i++) {
      db.rows.push({ id: `old${i}`, email: `old${i}@x.co`, team: "T", teamSize: "SIZE_1_5", status: "NEW", contactedAt: null, createdAt: new Date(NOW.getTime() - 2 * 3_600_000) });
    }
    await joinWaitlistWith(deps, form());
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("db error → retry message with values echoed", async () => {
    const { notify, deps } = setup({ createError: new Error("boom") });
    const r = await joinWaitlistWith(deps, form());
    expect(r.error).toBe("Something went wrong. Try again in a minute.");
    expect(r.values).toEqual({ email: "ana@team.co", team: "Acme", teamSize: "SIZE_6_15" });
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("waitlist admin helpers", () => {
  it("WAITLIST_SIZES lists the four sizes", () => {
    expect(WAITLIST_SIZES.map((s) => s.value)).toEqual(["SIZE_1_5", "SIZE_6_15", "SIZE_16_50", "SIZE_50_PLUS"]);
    expect(WAITLIST_SIZES.map((s) => s.label)).toEqual(["1–5", "6–15", "16–50", "50+"]);
  });

  it("setWaitlistStatus: CONTACTED sets contactedAt, NEW clears it", async () => {
    const { db } = setup();
    db.rows.push({ id: "a", email: "a@x.co", team: "T", teamSize: "SIZE_1_5", status: "NEW", contactedAt: null, createdAt: NOW });
    const dbh = db as unknown as WaitlistDeps["db"];
    await setWaitlistStatus(dbh, "a", "CONTACTED");
    expect(db.rows[0].status).toBe("CONTACTED");
    expect(db.rows[0].contactedAt).toBeInstanceOf(Date);
    await setWaitlistStatus(dbh, "a", "NEW");
    expect(db.rows[0].status).toBe("NEW");
    expect(db.rows[0].contactedAt).toBeNull();
  });

  it("listWaitlist returns newest first; deleteWaitlistEntry removes a row", async () => {
    const { db } = setup();
    const dbh = db as unknown as WaitlistDeps["db"];
    db.rows.push(
      { id: "old", email: "o@x.co", team: "T", teamSize: "SIZE_1_5", status: "NEW", contactedAt: null, createdAt: new Date("2026-01-01") },
      { id: "new", email: "n@x.co", team: "T", teamSize: "SIZE_1_5", status: "NEW", contactedAt: null, createdAt: new Date("2026-02-01") },
    );
    expect((await listWaitlist(dbh)).map((r) => r.id)).toEqual(["new", "old"]);
    await deleteWaitlistEntry(dbh, "new");
    expect(db.rows.map((r) => r.id)).toEqual(["old"]);
  });
});
