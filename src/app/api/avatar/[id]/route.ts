import { dbFor, requireUser } from "@/lib/session";
import { isUnauthenticated } from "@/lib/session-core";
import { loadProfilePhoto } from "@/lib/profilePhoto";

/** A profile photo for people in the signed-in user's workspace only. Signed-out callers get 401. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let me;
  try {
    me = await requireUser();
  } catch (e) {
    if (isUnauthenticated(e)) return new Response(null, { status: 401 });
    throw e;
  }
  const { id } = await params;
  const photo = await loadProfilePhoto(dbFor(me), id);
  if (!photo) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(photo.bytes), {
    headers: {
      "Content-Type": photo.type,
      // The URL carries the upload time (?v=), so a changed photo gets a new URL and can be cached for a long time.
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
