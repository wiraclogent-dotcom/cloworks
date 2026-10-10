# Library — design

**Date:** 2026-10-10
**Status:** Draft for review

## Goal

A shared **Library** page under **Tools** in the sidebar: named links grouped by category, so everyone in a
workspace finds the same reference material in one place — brand guidelines (NG), product knowledge, master box
sizes, latest updates.

**Success:** a teammate can find and open the right link in a few seconds; leads/admins can keep the list current
without a deploy; the newest information is visibly marked.

## Decisions

| Topic | Decision |
|---|---|
| Who edits | `ADMIN` and `LEAD` add, edit, pin, reorder and delete. Everyone else views and opens links. |
| Source of truth | Edited in the app (no Google Sheet sync, no hard-coded list). |
| Content | Links only (no file uploads in v1). |
| v1 extras | Pinned/featured items, "Updated" badge + date, optional brand tag. |
| Starter content | Each workspace gets four categories: Product Knowledge, Brand Guidelines (NG), Master Box Size, Latest Updates. |
| Delete | Permanent, behind a confirm dialog. A category can only be deleted when empty. |

**Out of scope (v1):** notifications on add/update, click counts, file uploads, per-role visibility, nested
folders, version history, comments, restore/trash.

## Data model (Prisma)

Both models are workspace-scoped like every other model (`workspaceId String @default(dbgenerated())`, stamped by
the scoped client in `src/lib/db.ts`, `@@index([workspaceId])`).

```prisma
model LibraryCategory {
  id        String        @id @default(cuid())
  name      String
  icon      String?       // lucide icon key from a small fixed set; null = default folder icon
  sortOrder Int           @default(0)
  items     LibraryItem[]

  workspaceId String    @default(dbgenerated())
  workspace   Workspace @relation(fields: [workspaceId], references: [id])

  @@unique([workspaceId, name])
  @@index([workspaceId])
}

model LibraryItem {
  id          String          @id @default(cuid())
  title       String
  url         String
  description String?
  categoryId  String
  category    LibraryCategory @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  brandId     String?
  brand       Brand?          @relation(fields: [brandId], references: [id], onDelete: SetNull)
  pinned      Boolean         @default(false)
  sortOrder   Int             @default(0)
  createdById String
  createdBy   User            @relation("LibraryItemCreatedBy", fields: [createdById], references: [id])
  updatedById String
  updatedBy   User            @relation("LibraryItemUpdatedBy", fields: [updatedById], references: [id])
  createdAt   DateTime        @default(now())
  /// Set only by create/edit — pinning and reordering leave it alone, so they don't trigger the badge.
  contentUpdatedAt DateTime   @default(now())

  workspaceId String    @default(dbgenerated())
  workspace   Workspace @relation(fields: [workspaceId], references: [id])

  @@index([workspaceId])
  @@index([categoryId])
}
```

- **"Updated" badge:** shown when `contentUpdatedAt` is within the last **14 days**; label reads `Updated · 3 Oct`
  (or `New · 3 Oct` when the item has never been edited since creation).
- **Starter categories:** created by the migration for existing workspaces and by workspace creation
  (`seedCore.ts`) for new ones.

## Page — `/library`

Route: `src/app/(app)/library/page.tsx`. Sidebar: add
`<NavItem href="/library" label="Library" icon={<LibraryBig/>}/>` to the **Tools** group in
`src/components/AppShell.tsx`, above the disabled Integrations item. Visible to every signed-in user.

Layout (same page width/spacing tokens as the rest of the app):

1. **Header** — title "Library", one-line subtitle; for ADMIN/LEAD: **Add link** (primary) and
   **Manage categories** (secondary).
2. **Filter bar** — search box (title, description, URL host), category chips ("All" + each category), brand
   select ("All brands" + brands in use).
3. **Pinned** strip — cards for pinned items (hidden when none match the filter).
4. **Category sections** — one section per category in `sortOrder`, each listing its items in `sortOrder`.
   Empty categories are hidden for viewers, shown with an "Add the first link" prompt for editors.

**Item row:** link-type icon derived from the URL host (Google Drive/Docs/Sheets/Slides, Figma, Canva, PDF by
extension, generic globe otherwise — a static map, no network favicon fetch), title, description (one line,
truncated), brand chip, Updated/New badge. The whole row is a link: `target="_blank" rel="noopener noreferrer"`.
Editors get a row menu: Edit, Pin/Unpin, Move up/down, Delete.

Filtering happens client-side over the full list (expected size: tens to low hundreds of items). Empty-result
state: "No links match" with a clear-filters button.

**Dialogs (editors only):** Add/Edit item (title, URL, description, category, brand, pinned) using the existing
form + `formErrors` patterns; Manage categories (rename, icon, reorder, add, delete-when-empty); Delete confirm.

## Server actions — `src/app/(app)/library/actions.ts`

`createItem`, `updateItem`, `deleteItem`, `setPinned`, `moveItem`, `createCategory`, `updateCategory`,
`moveCategory`, `deleteCategory`.

- Each resolves the caller via `actionUser` and rejects unless `appRole` is `ADMIN` or `LEAD`.
- All reads/writes go through the workspace-scoped client, so a foreign id is simply "not found".
- Validation (zod, matching `fieldSchema.ts` conventions): title 1–120 chars; description ≤ 300; URL must parse
  with `new URL()` and use `http:` or `https:`; category and brand must exist in the workspace.
- `deleteCategory` fails with "Move or delete its links first" when the category has items.
- `revalidatePath('/library')` after each change.

## Error handling

- Validation errors render inline in the dialog.
- Permission/not-found errors show the existing toast pattern; the UI hides edit controls for non-editors, but the
  server check is authoritative.

## Testing

- **Unit (actions):** non-editor is rejected for every action; URL validation rejects `javascript:`, `ftp:` and
  malformed URLs; non-empty category delete is refused; cross-workspace ids are not found; pin/reorder do not change
  `contentUpdatedAt`.
- **Component:** search, category chip and brand filters combine correctly; pinned strip and empty state; editor
  controls hidden for REQUESTER/CREATIVE.
- **E2E:** a LEAD adds a pinned item; a REQUESTER sees it in the Pinned strip with a "New" badge and the link opens
  in a new tab.
