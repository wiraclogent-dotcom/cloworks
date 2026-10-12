/** Picker label that tells two people apart: "Name — Full name" when the full name differs (ignoring case), else the name. */
export function personLabel(p: { name: string; fullName: string }): string {
  return p.fullName.trim().toLowerCase() === p.name.trim().toLowerCase() ? p.name : `${p.name} — ${p.fullName}`;
}
