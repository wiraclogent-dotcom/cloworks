"use client";

import { useState } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import {
  Bold, Check, Ellipsis, FolderInput, Italic, Link2, List, ListChecks, ListOrdered, Pin, PinOff, Strikethrough, Trash2, Type, Underline,
} from "lucide-react";
import { Toggle } from "@/components/shadcn/toggle";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/shadcn/popover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import { isSafeHref } from "@/lib/notes/doc";
import type { FolderRow, NoteDetail } from "@/lib/notes/notes";

const STYLES = [
  { key: "1", label: "Title" },
  { key: "2", label: "Heading" },
  { key: "3", label: "Subheading" },
  { key: "body", label: "Body" },
] as const;
type StyleKey = (typeof STYLES)[number]["key"];

const NO_FOLDER = "none";

/**
 * The Notes editor toolbar: text style (Title / Heading / Subheading / Body), marks, lists, link, and the note menu
 * (pin, move, delete). It reads the editor's state through `useEditorState`, so the toggles follow the selection.
 */
export function NoteToolbar({ editor, note, folders, linkOpen, onLinkOpenChange, onPin, onMove, onDelete }: {
  editor: Editor;
  note: NoteDetail;
  folders: FolderRow[];
  linkOpen: boolean;
  onLinkOpenChange: (open: boolean) => void;
  onPin: () => void;
  onMove: (folderId: string | null) => void;
  onDelete: () => void;
}) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      style: ([1, 2, 3] as const).map(String).find((l) => e.isActive("heading", { level: Number(l) })) ?? "body",
      bold: e.isActive("bold"), italic: e.isActive("italic"), underline: e.isActive("underline"), strike: e.isActive("strike"),
      bullet: e.isActive("bulletList"), ordered: e.isActive("orderedList"), task: e.isActive("taskList"),
      link: e.isActive("link"), href: (e.getAttributes("link").href as string | undefined) ?? "",
    }),
  });

  const setStyle = (k: StyleKey) => {
    const c = editor.chain().focus();
    (k === "body" ? c.setParagraph() : c.setHeading({ level: Number(k) as 1 | 2 | 3 })).run();
  };
  const mark = (label: string, shortcut: string, pressed: boolean, run: () => void, icon: React.ReactNode) => (
    <Toggle size="sm" aria-label={label} title={`${label} (${shortcut})`} pressed={pressed} onPressedChange={run} className="px-2">
      {icon}
    </Toggle>
  );
  const block = (label: string, pressed: boolean, run: () => void, icon: React.ReactNode) => (
    <Toggle size="sm" aria-label={label} title={label} pressed={pressed} onPressedChange={run} className="px-2">{icon}</Toggle>
  );

  return (
    <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Text style" title="Text style"><Type aria-hidden="true" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuRadioGroup value={s.style} onValueChange={(v) => setStyle(v as StyleKey)}>
            {STYLES.map((st) => <DropdownMenuRadioItem key={st.key} value={st.key}>{st.label}</DropdownMenuRadioItem>)}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
      {mark("Bold", "⌘B", s.bold, () => editor.chain().focus().toggleBold().run(), <Bold aria-hidden="true" />)}
      {mark("Italic", "⌘I", s.italic, () => editor.chain().focus().toggleItalic().run(), <Italic aria-hidden="true" />)}
      {mark("Underline", "⌘U", s.underline, () => editor.chain().focus().toggleUnderline().run(), <Underline aria-hidden="true" />)}
      {mark("Strikethrough", "⌘⇧S", s.strike, () => editor.chain().focus().toggleStrike().run(), <Strikethrough aria-hidden="true" />)}
      <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
      {block("Bulleted list", s.bullet, () => editor.chain().focus().toggleBulletList().run(), <List aria-hidden="true" />)}
      {block("Numbered list", s.ordered, () => editor.chain().focus().toggleOrderedList().run(), <ListOrdered aria-hidden="true" />)}
      {block("Checklist", s.task, () => editor.chain().focus().toggleTaskList().run(), <ListChecks aria-hidden="true" />)}
      <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
      <LinkControl editor={editor} active={s.link} href={s.href} open={linkOpen} onOpenChange={onLinkOpenChange} />

      <div className="ml-auto">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Note actions" title="Note actions"><Ellipsis aria-hidden="true" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={onPin}>
              {note.pinned ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />}{note.pinned ? "Unpin note" : "Pin note"}
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger><FolderInput aria-hidden="true" />Move to folder</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-72 w-52 overflow-y-auto">
                <DropdownMenuRadioGroup value={note.folderId ?? NO_FOLDER} onValueChange={(v) => onMove(v === NO_FOLDER ? null : v)}>
                  <DropdownMenuRadioItem value={NO_FOLDER}>No folder</DropdownMenuRadioItem>
                  {folders.map((f) => <DropdownMenuRadioItem key={f.id} value={f.id}>{f.name}</DropdownMenuRadioItem>)}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}><Trash2 aria-hidden="true" />Delete note</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

/** Link button + popover (also opened with ⌘K). Plain domains get https://; only web and mailto links are applied. */
function LinkControl({ editor, active, href, open, onOpenChange }: {
  editor: Editor; active: boolean; href: string; open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const openWith = (o: boolean) => { if (o) { setValue(href); setError(null); } onOpenChange(o); };

  const apply = () => {
    const v = value.trim();
    if (!v) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return onOpenChange(false);
    }
    const url = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
    if (!isSafeHref(url)) return setError("Use a web address or an email link (mailto:).");
    const chain = editor.chain().focus();
    if (editor.state.selection.empty && !active) chain.insertContent({ type: "text", text: v, marks: [{ type: "link", attrs: { href: url } }] }).run();
    else chain.extendMarkRange("link").setLink({ href: url }).run();
    onOpenChange(false);
  };

  return (
    <Popover open={open} onOpenChange={openWith}>
      <PopoverAnchor asChild>
        <Toggle size="sm" aria-label="Link" title="Link (⌘K)" pressed={active || open} onPressedChange={() => openWith(!open)} className="px-2">
          <Link2 aria-hidden="true" />
        </Toggle>
      </PopoverAnchor>
      <PopoverContent align="start" className="w-80">
        <form onSubmit={(e) => { e.preventDefault(); apply(); }} className="space-y-2">
          <label htmlFor="note-link" className="text-sm font-medium text-foreground">Link</label>
          <Input id="note-link" autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="https://… or mailto:…"
            aria-invalid={error ? true : undefined} aria-describedby={error ? "note-link-error" : undefined} />
          {error ? <p id="note-link-error" className="text-xs text-danger">{error}</p> : null}
          <div className="flex justify-end gap-2">
            {active ? (
              <Button type="button" variant="outline" size="sm"
                onClick={() => { editor.chain().focus().extendMarkRange("link").unsetLink().run(); onOpenChange(false); }}>Remove</Button>
            ) : null}
            <Button type="submit" variant="default" size="sm"><Check aria-hidden="true" />Apply</Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
