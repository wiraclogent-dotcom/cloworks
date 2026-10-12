import type { MediaType } from "@prisma/client";
import type { CloudinaryConfig } from "./config";
import { signParams } from "./sign";

export type CloudinaryResource = { bytes: number; width: number; height: number; duration?: number; format: string };

export interface CloudinaryClient {
  getResource(publicId: string, type: MediaType): Promise<CloudinaryResource | null>;
  destroy(publicId: string, type: MediaType): Promise<void>;
}

const kindOf = (type: MediaType) => (type === "VIDEO" ? "video" : "image");

/** Admin API client over fetch (no SDK). */
export function cloudinaryClient(cfg: CloudinaryConfig): CloudinaryClient {
  const base = `https://api.cloudinary.com/v1_1/${cfg.cloudName}`;
  return {
    async getResource(publicId, type) {
      const path = publicId.split("/").map(encodeURIComponent).join("/");
      const res = await fetch(`${base}/resources/${kindOf(type)}/upload/${path}`, {
        headers: { Authorization: `Basic ${Buffer.from(`${cfg.apiKey}:${cfg.apiSecret}`).toString("base64")}` },
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Cloudinary resource lookup failed (${res.status})`);
      const r = (await res.json()) as CloudinaryResource;
      return { bytes: r.bytes, width: r.width, height: r.height, duration: r.duration, format: r.format };
    },
    async destroy(publicId, type) {
      const signed = { public_id: publicId, timestamp: String(Math.floor(Date.now() / 1000)) };
      const body = new URLSearchParams({ ...signed, api_key: cfg.apiKey, signature: signParams(signed, cfg.apiSecret) });
      const res = await fetch(`${base}/${kindOf(type)}/destroy`, { method: "POST", body });
      if (!res.ok) throw new Error(`Cloudinary destroy failed (${res.status})`);
    },
  };
}
