import type { CSSProperties } from "react";
import { ART, artSources, type ArtName } from "@/lib/brand/art";
import { cn } from "./cn";

/** Inlined at build time from CLOUDINARY_CLOUD_NAME (next.config.ts), so this works in server and client components. */
const CLOUD = process.env.NEXT_PUBLIC_BRAND_CLOUD ?? "";

/**
 * A brand illustration from Cloudinary. Decorative by default (empty alt); pass `alt` when it carries meaning.
 * `width` is the largest CSS width it is shown at; width/height attributes reserve space, so nothing shifts.
 * `priority` for the one above-the-fold hero image; everything else loads lazily. Renders nothing without Cloudinary.
 */
export function BrandArt({ name, width, alt = "", priority, sizes, className, style }: {
  name: ArtName; width: number; alt?: string; priority?: boolean; sizes?: string; className?: string; style?: CSSProperties;
}) {
  if (!CLOUD) return null;
  const { src, srcSet } = artSources(CLOUD, name, width);
  const height = Math.round((width * ART[name].h) / ART[name].w);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Cloudinary already resizes and picks the format.
    <img src={src} srcSet={srcSet} sizes={sizes ?? `${width}px`} width={width} height={height} alt={alt}
      aria-hidden={alt ? undefined : true} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : undefined}
      decoding="async" draggable={false} style={style} className={cn("pointer-events-none h-auto max-w-full select-none", className)} />
  );
}
