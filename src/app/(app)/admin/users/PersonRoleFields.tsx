"use client";

import { useState } from "react";
import { Labeled, selectControl, type FormCtx } from "@/components/admin/AdminForm";
import { enumLabel } from "@/lib/adminChips";
import type { LinkablePerson } from "@/lib/linkPerson";
import { personLabel } from "@/lib/personLabel";

const APP_ROLES = ["REQUESTER", "CREATIVE", "LEAD", "ADMIN"] as const;
const JOB_ROLES = ["DESIGNER", "SOCIAL_MEDIA", "OTHER"] as const;

/**
 * Existing-person picker plus App role and Job role selects (three grid/flex items). Choosing a person fills the role
 * selects with theirs; they stay editable. Controlled, so values survive; AdminForm's nonce key remounts after a submit.
 */
export function PersonRoleFields({ linkable, v, idFor, name, label, noneLabel }: {
  linkable: LinkablePerson[]; v: FormCtx["v"]; idFor: FormCtx["idFor"]; name: string; label: string; noneLabel: string;
}) {
  const [userId, setUserId] = useState(v(name));
  const [appRole, setAppRole] = useState(v("appRole", "REQUESTER"));
  const [jobRole, setJobRole] = useState(v("jobRole", "OTHER"));
  const pick = (id: string) => {
    setUserId(id);
    const p = linkable.find((x) => x.id === id);
    if (p) {
      setAppRole(p.appRole);
      setJobRole(p.jobRole);
    }
  };
  return (
    <>
      <Labeled id={idFor(name)} label={label}>
        <select id={idFor(name)} name={name} className={selectControl} value={userId} onChange={(e) => pick(e.target.value)}>
          <option value="">{noneLabel}</option>
          {linkable.map((p) => <option key={p.id} value={p.id}>{personLabel(p)}</option>)}
        </select>
      </Labeled>
      <Labeled id={idFor("appRole")} label="App role">
        <select id={idFor("appRole")} name="appRole" className={selectControl} value={appRole} onChange={(e) => setAppRole(e.target.value)}>
          {APP_ROLES.map((r) => <option key={r} value={r}>{enumLabel(r)}</option>)}
        </select>
      </Labeled>
      <Labeled id={idFor("jobRole")} label="Job role">
        <select id={idFor("jobRole")} name="jobRole" className={selectControl} value={jobRole} onChange={(e) => setJobRole(e.target.value)}>
          {JOB_ROLES.map((r) => <option key={r} value={r}>{enumLabel(r)}</option>)}
        </select>
      </Labeled>
    </>
  );
}
