import { requireScope } from "@/lib/session";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { AdminDenied } from "../AdminDenied";
import { AddPersonForm } from "../users/UserForms";

/** Creating an account directly (with a temporary password). The invite flow is the usual way in; this is the fallback. */
export async function AddPersonContent() {
  const { user } = await requireScope();
  if (!can(user.appRole, "admin.manage")) return <AdminDenied />;
  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Settings", href: "/settings" }, { label: "Admin" }, { label: "Add person" }]}
        title="Add person"
        description="Create an account now with a temporary password. When the person can use email, an invite is better: they set their own password."
      />
      <Card>
        <section aria-label="New account">
          <AddPersonForm />
        </section>
      </Card>
    </>
  );
}
