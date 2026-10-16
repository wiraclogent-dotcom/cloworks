import type { WaitlistStatus } from "@prisma/client";
import { prisma } from "./db";
import { deleteWaitlistEntry, joinWaitlistWith, listWaitlist, setWaitlistStatus, type NewWaitlistEntry } from "./waitlist";

// WaitlistEntry is global (not workspace-scoped) and the sign-up is public, so these wrappers hand the raw client to the
// waitlist functions and the app code never imports it. Callers must check `isPlatformAdmin` before the admin ones.

/** Public sign-up from the landing page. */
export const joinWaitlistBy = (notify: (e: NewWaitlistEntry) => void, fd: FormData) => joinWaitlistWith({ db: prisma, notify }, fd);

/** Everyone on the list, newest first. */
export const loadWaitlist = () => listWaitlist(prisma);

export const setWaitlistStatusBy = (id: string, status: WaitlistStatus) => setWaitlistStatus(prisma, id, status);

export const deleteWaitlistEntryBy = (id: string) => deleteWaitlistEntry(prisma, id);
