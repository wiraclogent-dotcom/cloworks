import { requireScope } from "@/lib/session";
import { BrandDirectorySync } from "./BrandDirectorySync";

/** Server half of the brand directory: every brand's colour, archived ones included (their old badges keep it). */
export async function BrandDirectory() {
  const { db } = await requireScope();
  const entries = await db.brand.findMany({ select: { name: true, color: true } });
  return <BrandDirectorySync entries={entries} />;
}
