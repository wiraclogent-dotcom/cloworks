import type { MediaType } from "@prisma/client";

export type MediaPreset = "avatar-64" | "grid-3x4" | "reel-9x16" | "story-9x16" | "panel" | "full" | "poster";

const TRANSFORM: Record<MediaPreset, string> = {
  "avatar-64": "c_fill,w_64,h_64",
  "grid-3x4": "c_fill,ar_3:4,w_360",
  "reel-9x16": "c_fill,ar_9:16,w_360",
  "story-9x16": "c_fill,ar_9:16,w_540",
  panel: "c_limit,w_900",
  full: "c_limit,w_2048",
  poster: "c_fill,ar_3:4,w_360",
};

/** Delivery URL for a stored asset. `poster` is the first frame of a video as a jpg. */
export function mediaUrl(m: { publicId: string; type: MediaType }, preset: MediaPreset, cloudName: string): string {
  const base = `https://res.cloudinary.com/${cloudName}`;
  if (preset === "poster") return `${base}/video/upload/${TRANSFORM.poster},f_auto,q_auto/so_0/${m.publicId}.jpg`;
  const kind = m.type === "VIDEO" ? "video" : "image";
  return `${base}/${kind}/upload/${TRANSFORM[preset]},f_auto,q_auto/${m.publicId}`;
}
