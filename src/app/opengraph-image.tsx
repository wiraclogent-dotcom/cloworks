import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { LANDING_TITLE } from "@/lib/seo";

export const alt = LANDING_TITLE;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// ImageResponse has no Tailwind and no CSS variables: inline styles only, and the Prism picture goes in as a data URL.
export default async function Image() {
  const jpg = await readFile(join(process.cwd(), "public/board/gradient.jpg"));
  const background = `data:image/jpeg;base64,${jpg.toString("base64")}`;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative" }}>
        <img src={background} alt="" width={1200} height={630} style={{ position: "absolute", inset: 0, width: 1200, height: 630, objectFit: "cover" }} />
        <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.4)" }} />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 96px", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <svg width={72} height={72} viewBox="0 0 28 28">
              <rect width="28" height="28" rx="8" fill="#1f5eff" />
              <path d="M14 5.5l2 6.5 6.5 2-6.5 2-2 6.5-2-6.5L5.5 14l6.5-2z" fill="#ffffff" />
            </svg>
            <div style={{ fontSize: 48, fontWeight: 700, color: "#0a0f1f" }}>Clowork</div>
          </div>
          <div style={{ marginTop: 48, fontSize: 84, fontWeight: 700, lineHeight: 1.05, color: "#0a0f1f", letterSpacing: -2, maxWidth: 960 }}>
            Manage every design request, from brief to done.
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
