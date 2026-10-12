import { createHash, randomBytes } from "node:crypto";
import type { CloudinaryConfig } from "./config";
import { ALLOWED_FORMATS, VIDEO_INCOMING_TRANSFORMATION } from "./config";

export type MediaPurpose = "content" | "avatar";

export type SignedUpload = {
  cloudName: string; apiKey: string; timestamp: number; signature: string; folder: string; publicId: string;
  uploadUrl: string; params: Record<string, string>;
};

/** Cloudinary's scheme: SHA-1 of the sorted `k=v&...` string with the API secret appended directly. */
export function signParams(params: Record<string, string>, apiSecret: string): string {
  const toSign = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
  return createHash("sha1").update(toSign + apiSecret).digest("hex");
}

/**
 * Signs a direct browser upload. The public_id is the full path (accounts with dynamic folders do not prefix it
 * from a folder param), and asset_folder places the asset in the matching folder.
 */
export function signUpload(cfg: CloudinaryConfig, workspaceId: string, purpose: MediaPurpose, kind: "image" | "video", now = Date.now()): SignedUpload {
  const folder = `clowork/${workspaceId}/${purpose}`;
  const publicId = `${folder}/${randomBytes(12).toString("base64url")}`;
  const timestamp = Math.floor(now / 1000);
  const signed: Record<string, string> = {
    public_id: publicId,
    asset_folder: folder,
    timestamp: String(timestamp),
    allowed_formats: ALLOWED_FORMATS.join(","),
  };
  if (kind === "video") signed.transformation = VIDEO_INCOMING_TRANSFORMATION;
  const signature = signParams(signed, cfg.apiSecret);
  return {
    cloudName: cfg.cloudName,
    apiKey: cfg.apiKey,
    timestamp,
    signature,
    folder,
    publicId,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cfg.cloudName}/${kind}/upload`,
    params: { ...signed, api_key: cfg.apiKey, signature },
  };
}
