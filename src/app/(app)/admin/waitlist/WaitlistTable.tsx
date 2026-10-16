"use client";

import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableRowHeader } from "@/components/shadcn/table";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/shadcn/alert-dialog";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { deleteWaitlist, markWaitlist } from "./actions";

export type WaitlistRow = {
  id: string; email: string; team: string; size: string; status: "NEW" | "CONTACTED"; joined: string; contacted: string | null;
};

/** Encoded so an address like `a?body=x@acme.co` stays one recipient and cannot add mailto query parameters. */
const mailto = (email: string) => `mailto:${encodeURIComponent(email).replace("%40", "@")}`;

/** Rows are already formatted by the server component; the actions re-check the platform-admin gate on every call. */
export function WaitlistTable({ rows }: { rows: WaitlistRow[] }) {
  return (
    <Table containerClassName="max-h-[calc(100dvh-16rem)]" className="min-w-[48rem]">
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Signed up</TableHead>
          <TableHead scope="col">Email</TableHead>
          <TableHead scope="col">Team</TableHead>
          <TableHead scope="col">Size</TableHead>
          <TableHead scope="col">Status</TableHead>
          <TableHead scope="col"><span className="sr-only">Actions</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const contacted = r.status === "CONTACTED";
          return (
            <TableRow key={r.id}>
              <TableCell className="whitespace-nowrap text-muted-foreground">{r.joined}</TableCell>
              <TableRowHeader>
                <a href={mailto(r.email)} className="text-link underline-offset-2 hover:underline">{r.email}</a>
              </TableRowHeader>
              <TableCell>{r.team}</TableCell>
              <TableCell>{r.size}</TableCell>
              <TableCell>
                <Badge tone={contacted ? "done" : "tag-neutral"}>{contacted ? "Contacted" : "New"}</Badge>
                {r.contacted ? <span className="ml-2 text-xs text-muted-foreground">{r.contacted}</span> : null}
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-2">
                  <form action={markWaitlist.bind(null, r.id, contacted ? "NEW" : "CONTACTED")}>
                    <SubmitButton variant="outline" size="sm" pendingLabel="Saving…"
                      aria-label={`${contacted ? "Mark as new" : "Mark contacted"}: ${r.team}`}>
                      {contacted ? "Mark as new" : "Mark contacted"}
                    </SubmitButton>
                  </form>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" aria-label={`Delete ${r.team}`}>Delete</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <form action={deleteWaitlist.bind(null, r.id)} className="grid gap-4">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
                          <AlertDialogDescription>This can&apos;t be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel variant="outline">Cancel</AlertDialogCancel>
                          <SubmitButton variant="destructive" pendingLabel="Deleting…">Delete</SubmitButton>
                        </AlertDialogFooter>
                      </form>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
