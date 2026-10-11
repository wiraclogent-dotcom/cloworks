"use server";

import { revalidatePath } from "next/cache";
import { withUser } from "@/lib/actionUser";
import { dbFor, requireUser } from "@/lib/session";
import { MAX_PHOTO_BYTES, PhotoError, removeProfilePhoto, setProfilePhoto } from "@/lib/profilePhoto";

export type PhotoResult = { ok: true } | { ok: false; message: string };

const SESSION_ENDED: PhotoResult = { ok: false, message: "Your session ended. Sign in again." };

/** Saves the picture the browser resized (or the one chosen, if it is already small). Identity comes from the session. */
export async function changeProfilePhoto(fd: FormData): Promise<PhotoResult> {
  return withUser<PhotoResult, PhotoResult>(requireUser, async (me) => {
    const file = fd.get("photo");
    if (!(file instanceof File)) return { ok: false, message: "Choose a picture first." };
    if (file.size > MAX_PHOTO_BYTES) return { ok: false, message: "That picture is too large. Choose a smaller one." };
    try {
      await setProfilePhoto(dbFor(me), me.id, new Uint8Array(await file.arrayBuffer()));
    } catch (e) {
      if (e instanceof PhotoError) return { ok: false, message: e.message };
      return { ok: false, message: "Could not save the photo. Try again." };
    }
    revalidatePath("/settings");
    return { ok: true };
  }, () => SESSION_ENDED);
}

/** Goes back to initials. */
export async function clearProfilePhoto(): Promise<PhotoResult> {
  return withUser<PhotoResult, PhotoResult>(requireUser, async (me) => {
    await removeProfilePhoto(dbFor(me), me.id);
    revalidatePath("/settings");
    return { ok: true };
  }, () => SESSION_ENDED);
}
