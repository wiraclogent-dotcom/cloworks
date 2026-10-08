import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { AdminDenied } from "../AdminDenied";
import { AdminTabs } from "../AdminTabs";
import { ActiveToggle, AddAllowedForm, AddPersonForm, EditUserForm, LoginEmailForm, RemoveAllowed } from "./UserForms";

/** Permission is checked BEFORE any query, so a non-admin payload contains no admin data. */
export async function UsersContent() {
  const viewer = await requireUser();
  if (!can(viewer.appRole, "admin.manage")) return <AdminDenied />;

  const [users, allowed] = await Promise.all([
    prisma.user.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] }),
    prisma.allowedEmail.findMany({ orderBy: { email: "asc" } }),
  ]);
  const owners = new Map(users.filter((u) => u.email).map((u) => [u.email!.toLowerCase(), u.name]));

  return (
    <>
      <AdminTabs current="users" />
      <h1 className="mb-1 text-2xl font-semibold">People and access</h1>
      <p className="mb-4 text-muted-foreground">
        Company-domain addresses can sign in once bound to a person. Anyone else needs the address on the allowed list (adding a login email below does this for you).
      </p>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">All people</caption>
          <thead className="bg-muted">
            <tr>
              {["Name", "Full name", "Title", "Job role", "App role", "Login email", "Status", "Manage"].map((h) => (
                <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-border align-top">
                <th scope="row" className="px-3 py-2 font-medium">{u.name}</th>
                <td className="px-3 py-2">{u.fullName}</td>
                <td className="px-3 py-2">{u.title ?? "—"}</td>
                <td className="px-3 py-2">{u.jobRole}</td>
                <td className="px-3 py-2">{u.appRole}</td>
                <td className="px-3 py-2">{u.email ?? "No login"}</td>
                <td className="px-3 py-2">{u.active ? "Active" : "Inactive"}</td>
                <td className="min-w-72 px-3 py-2">
                  <details>
                    <summary className="cursor-pointer focus-visible:outline-2 focus-visible:outline-ring">Edit {u.name}</summary>
                    <div className="mt-3 space-y-4">
                      <EditUserForm u={u} />
                      <LoginEmailForm u={u} />
                      <ActiveToggle u={u} />
                    </div>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section aria-labelledby="add-person-h" className="mt-8 max-w-2xl">
        <h2 id="add-person-h" className="mb-2 text-lg font-semibold">Add person</h2>
        <AddPersonForm />
      </section>

      <section aria-labelledby="allowed-h" className="mt-8 max-w-2xl">
        <h2 id="allowed-h" className="mb-2 text-lg font-semibold">Allowed emails</h2>
        {allowed.length === 0 ? (
          <p className="mb-3 text-muted-foreground">No outside addresses are allowed.</p>
        ) : (
          <ul className="mb-4 divide-y divide-border rounded-md border border-border">
            {allowed.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 p-3">
                <div>
                  <p className="font-medium">{a.email}</p>
                  <p className="text-sm text-muted-foreground">
                    {owners.has(a.email.toLowerCase()) ? `Used by ${owners.get(a.email.toLowerCase())}` : "Not linked to a person"}
                    {a.note ? ` · ${a.note}` : ""}
                  </p>
                </div>
                <RemoveAllowed email={a.email} />
              </li>
            ))}
          </ul>
        )}
        <AddAllowedForm />
      </section>
    </>
  );
}
