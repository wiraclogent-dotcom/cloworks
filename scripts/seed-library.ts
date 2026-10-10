import { createCategoryWith, createItemWith, type Actor } from "@/lib/library";
import type { CategoryIconKey } from "@/lib/libraryIcons";
import { resolveWorkspace } from "./lib/workspaceArg";

// Seeds the first Library links, taken from the "Directory" tab of the Creative Worksheet (rows with a hyperlink).
// Idempotent: categories are matched by name, items by URL; existing rows are left alone. Goes through the library
// cores (same validation as the app), acting as the ADMIN given by --as <email> (default: the first active ADMIN).
// Dry-run by default; --apply writes.
//
// Usage: npm run seed:library -- [--as <admin email>] [--apply] [--workspace <slug>]

type Seed = { title: string; url: string; description?: string; brand?: string; pinned?: boolean };
type Group = { category: string; icon: CategoryIconKey | null; items: Seed[] };

const GROUPS: Group[] = [
  {
    category: "Packshoot & Artwork", icon: "folder", items: [
      { title: "Packshoot – all brands", description: "Foto Produk · Clogent, Clenvo, Bubble Wash", url: "https://drive.google.com/drive/folders/1GxLUqLhKNI5pUKaCpAjUL-TyTWWABQGi?usp=sharing" },
      { title: "Final Artwork – all products", description: "Repackage · Clogent, Clenvo, Bubble Wash", url: "https://drive.google.com/drive/folders/1LT_z7whZ12mya_Bsn_LVUnYW-B85WDwV" },
    ],
  },
  {
    category: "Brand Assets", icon: "palette", items: [
      { title: "Brand Asset Clogent", brand: "Clogent", pinned: true, url: "https://drive.google.com/drive/folders/1fyBBkYnURAZzZqp9Wop1mCkDplAxGHoU?usp=drive_link" },
      { title: "Brand Asset SKC", url: "https://drive.google.com/drive/folders/17WnBhVxhqQ3opGZ7_i8Lt82AwWLExuD5" },
    ],
  },
  {
    category: "Product Knowledge", icon: null, items: [
      { title: "Manuscript Product", description: "Redaksi Clogent", brand: "Clogent", url: "https://docs.google.com/spreadsheets/d/1HaFddi79mthvEC1-srsfckfJCGVJMOaoITVtjl8hDp8/edit?gid=0" },
      { title: "Barcode List", description: "Barcode GS1", url: "https://docs.google.com/spreadsheets/d/13FPErOccFW2iD_qHIMRKn2hWzqpvYAEwIYBAgsG2Ef8/edit?gid=0" },
      { title: "Sertifikasi – List Produk", url: "https://docs.google.com/spreadsheets/d/1L0cSULqZRcmuoJO9d_jKsefWCaaoqinJblFWVO72aqY/edit?gid=1474205147" },
    ],
  },
  {
    category: "Photoshoots", icon: "megaphone", items: [
      { title: "Photoshoot Cloghome", description: "Batch 1 APB · 13 Juni 2026", url: "https://drive.google.com/drive/folders/1SfSAm-D9ZJ0w3x1LmJsKNC1dmygTX4VJ" },
      { title: "Photoshoot Footwear Protector", description: "Batch 2 · 24 Juli 2026", url: "https://drive.google.com/open?id=1P82Yu9gSowxTSyuKYcQpdjimq_r21yf0&usp=drive_copy" },
    ],
  },
  {
    category: "Master Folders", icon: "box", items: [
      { title: "Packaging Rebranding", description: "Master folder · Rebranding", pinned: true, url: "https://drive.google.com/drive/folders/161psoF27rioYeY4QsaBEmWgeqsRgsP0h?usp=drive_link" },
      { title: "PDP Redesign", description: "Master folder · PDP NEW", url: "https://drive.google.com/drive/folders/1NCk_i0wc4t926pw1oQiUnnd0LXsgvzKn" },
    ],
  },
];

async function main() {
  const apply = process.argv.includes("--apply");
  const ws = await resolveWorkspace();
  const db = ws.db;
  try {
    const i = process.argv.indexOf("--as");
    const email = i >= 0 ? process.argv[i + 1] : undefined;
    const admin = await db.user.findFirst({
      where: { appRole: "ADMIN", active: true, ...(email ? { email } : {}) }, orderBy: { name: "asc" }, select: { id: true, name: true },
    });
    if (!admin) throw new Error(email ? `No active ADMIN with email ${email}.` : "No active ADMIN in this workspace to act as.");
    const actor: Actor = { id: admin.id, appRole: "ADMIN" };
    console.log(`Acting as ${admin.name}`);

    let made = 0, skipped = 0;
    for (const g of GROUPS) {
      let cat = await db.libraryCategory.findFirst({ where: { name: g.category }, select: { id: true } });
      if (!cat) {
        console.log(`+ category "${g.category}"`);
        if (apply) cat = await createCategoryWith(db, actor, { name: g.category, icon: g.icon });
      }
      for (const it of g.items) {
        if (await db.libraryItem.findFirst({ where: { url: it.url }, select: { id: true } })) {
          skipped++;
          console.log(`= ${g.category} / ${it.title} (already there)`);
          continue;
        }
        const brand = it.brand ? await db.brand.findFirst({ where: { name: it.brand }, select: { id: true } }) : null;
        if (it.brand && !brand) console.log(`  ! brand "${it.brand}" not found; leaving the item untagged`);
        console.log(`+ ${g.category} / ${it.title}${it.pinned ? " (pinned)" : ""}`);
        made++;
        if (apply && cat)
          await createItemWith(db, actor, {
            title: it.title, url: it.url, description: it.description ?? null, categoryId: cat.id, brandId: brand?.id ?? null, pinned: it.pinned ?? false,
          });
      }
    }
    console.log(`\n${made} to add, ${skipped} already present.${apply ? "" : " Dry run: nothing written. Re-run with --apply to write."}`);
  } finally {
    await ws.disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
