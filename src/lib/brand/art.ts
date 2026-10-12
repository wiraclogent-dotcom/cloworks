/**
 * Brand illustrations (soft 3D clay, generated in Magnific), stored on Cloudinary at clowork/brand/<name> by
 * scripts/upload-brand-art.local.mts. All are transparent PNG masters; delivery picks AVIF/WebP and the width.
 */
export const ART = {
  hero: { w: 3072, h: 2048 },
  auth: { w: 1536, h: 2048 },
  "step-brief": { w: 1024, h: 1024 },
  "step-make": { w: 1024, h: 1024 },
  celebrate: { w: 1024, h: 1024 },
  "role-social": { w: 1024, h: 1024 },
  "role-lead": { w: 1024, h: 1024 },
  "empty-requests": { w: 1024, h: 1024 },
  "empty-projects": { w: 1024, h: 1024 },
  "empty-library": { w: 1024, h: 1024 },
  "empty-content": { w: 1024, h: 1024 },
  "empty-notifications": { w: 1024, h: 1024 },
  "empty-search": { w: 1024, h: 1024 },
  "empty-kpi": { w: 1024, h: 1024 },
  "not-found": { w: 1024, h: 1024 },
  access: { w: 1024, h: 1024 },
} as const satisfies Record<string, { w: number; h: number }>;

export type ArtName = keyof typeof ART;

/** Widths offered in srcset; never above the master's own width. */
const STEPS = [160, 240, 320, 480, 640, 960, 1280, 1600, 2048];

/** Cloudinary delivery URL for one width (`f_auto,q_auto`: AVIF/WebP at an automatic quality). */
export function artUrl(cloudName: string, name: ArtName, width: number): string {
  return `https://res.cloudinary.com/${cloudName}/image/upload/f_auto,q_auto,c_limit,w_${width}/clowork/brand/${name}`;
}

/** `src` and `srcset` for an image shown at `displayWidth` CSS px (covers 1x and 2x screens). */
export function artSources(cloudName: string, name: ArtName, displayWidth: number): { src: string; srcSet: string } {
  const max = Math.min(ART[name].w, displayWidth * 2);
  const widths = [...STEPS.filter((w) => w < max), max];
  return {
    src: artUrl(cloudName, name, Math.min(ART[name].w, displayWidth)),
    srcSet: widths.map((w) => `${artUrl(cloudName, name, w)} ${w}w`).join(", "),
  };
}
