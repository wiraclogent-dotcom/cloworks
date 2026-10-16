export type CloudinaryConfig = { cloudName: string; apiKey: string; apiSecret: string };

/** Cloudinary credentials from the environment, or null when any is missing (uploads are then disabled). */
export function cloudinaryConfig(env: Record<string, string | undefined> = process.env): CloudinaryConfig | null {
  const cloudName = env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = env.CLOUDINARY_API_SECRET?.trim();
  return cloudName && apiKey && apiSecret ? { cloudName, apiKey, apiSecret } : null;
}

export const IMAGE_FORMATS = ["jpg", "png", "webp", "heic"] as const;
export const VIDEO_FORMATS = ["mp4", "mov"] as const;
export const ALLOWED_FORMATS = [...IMAGE_FORMATS, ...VIDEO_FORMATS];

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 90;

/** Incoming transformation applied to uploaded videos. */
export const VIDEO_INCOMING_TRANSFORMATION = "c_limit,w_1280,h_1280,q_auto";
