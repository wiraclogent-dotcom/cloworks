"use client";

import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from "react";
import { ImageIcon, ImagePlus, LayoutGrid, Trash2, WandSparkles } from "lucide-react";
import {
  AA, BOARD_PRESETS, PLAIN_BOARD, autoVeil, resolveBoardBackground, textContrast, thumbOf,
  type BoardBackground, type BoardBackgroundId,
} from "@/lib/boardBackground";
import { MAX_IMAGE_BYTES } from "@/lib/media/config";
import { postToCloudinary } from "@/lib/media/browserUpload";
import { registerBoardUpload, removeBoardPicture, requestBoardUploadSignature, saveBoardBackground } from "@/app/(app)/requests/backgroundActions";
import { Button } from "@/components/shadcn/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn/popover";
import { RadioGroup, RadioGroupItem } from "@/components/shadcn/radio-group";
import { Slider } from "@/components/shadcn/slider";
import { cn } from "@/components/ui/cn";
import { useBoardBackground } from "./BoardBackgroundProvider";

/** The picture scaled down for measuring (the whole picture, so the result holds wherever a card sits). */
const SAMPLE_W = 320, SAMPLE_H = 192;
type Sample = { src: string; data: Uint8ClampedArray };

/** Reads a picture's pixels; null when the browser cannot (no CORS on the host, decode error). */
function sample(src: string): Promise<Sample | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = SAMPLE_W; canvas.height = SAMPLE_H;
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0, SAMPLE_W, SAMPLE_H);
        resolve({ src, data: ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** The gentler of the two AA veils (white text under navy, or dark text under white); 60 when neither side can. */
function bestVeil(s: Sample): number {
  const dark = autoVeil(s.data, SAMPLE_W, SAMPLE_H, "dark");
  const light = autoVeil(s.data, SAMPLE_W, SAMPLE_H, "light");
  if (dark == null && light == null) return 60;
  if (dark == null) return light!;
  if (light == null) return dark;
  return Math.abs(light) < dark ? light : dark;
}

const valueText = (veil: number) => (veil === 0 ? "No veil" : veil > 0 ? `Dark ${veil}%` : `Light ${-veil}%`);

/**
 * "Background" in the board toolbar: pick a preset or upload a picture, then slide the veil between light and dark.
 * Every change shows on the board at once (shared state) and is saved to the person's account; the contrast line
 * measures the picture under the veil and "Make readable" finds the gentlest veil that keeps the card text AA.
 */
export function BoardBackgroundPicker({ customSrc: initialCustom }: { customSrc: string | null }) {
  const ctx = useBoardBackground();
  const uid = useId();
  const [customSrc, setCustomSrc] = useState(initialCustom);
  const [pixels, setPixels] = useState<Sample | null>(null);
  const [unreadable, setUnreadable] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Set when the veil should be chosen for the person as soon as the picture's pixels are known (new upload, custom picked).
  const autoPending = useRef(false);

  const bg = ctx?.background ?? PLAIN_BOARD;
  const setBg = (next: BoardBackground) => ctx?.setBackground(next);

  async function save(next: BoardBackground) {
    const r = await saveBoardBackground({ id: next.id, veil: next.veil });
    setError(r.ok ? null : r.message);
  }

  // Measure the chosen picture; pick an AA veil for it when asked.
  useEffect(() => {
    const src = bg.src;
    if (!src) return;
    let live = true;
    void sample(src).then((s) => {
      if (!live) return;
      setPixels(s);
      setUnreadable(!s);
      if (autoPending.current) {
        autoPending.current = false;
        const next = { ...bg, veil: s ? bestVeil(s) : 60 };
        setBg(next);
        void save(next);
      }
    });
    return () => { live = false; };
    // Only the picture matters here: the veil changes on every slider step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bg.src]);

  const contrast = useMemo(
    () => (pixels && pixels.src === bg.src ? textContrast(pixels.data, SAMPLE_W, SAMPLE_H, bg.veil) : null),
    [pixels, bg.src, bg.veil],
  );

  function choose(id: string) {
    let next: BoardBackground;
    if (id === "custom") {
      if (!customSrc) return;
      next = { id: "custom", veil: 0, src: customSrc };
      autoPending.current = true;
    } else {
      next = resolveBoardBackground({ id, veil: null, customSrc: null });
    }
    setBg(next);
    if (!autoPending.current) void save(next);
  }

  function makeReadable() {
    if (!pixels) return;
    const side = bg.veil < 0 ? "light" : "dark";
    const v = autoVeil(pixels.data, SAMPLE_W, SAMPLE_H, side) ?? autoVeil(pixels.data, SAMPLE_W, SAMPLE_H, side === "dark" ? "light" : "dark");
    if (v == null) return;
    const next = { ...bg, veil: v };
    setBg(next);
    void save(next);
  }

  async function upload(file: File) {
    setError(null);
    setProgress(0);
    try {
      const signed = await requestBoardUploadSignature();
      if (!signed.ok) { setError(signed.message); return; }
      await postToCloudinary(signed.upload.uploadUrl, signed.upload.params, file, setProgress);
      const reg = await registerBoardUpload(signed.upload.publicId);
      if (!reg.ok) { setError(reg.message); return; }
      setCustomSrc(reg.src);
      autoPending.current = true;
      setBg({ id: "custom", veil: 0, src: reg.src });
    } catch {
      setError("Upload failed. Try again.");
    } finally {
      setProgress(null);
    }
  }

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|heic)$/.test(file.type) && !/\.(jpe?g|png|webp|heic)$/i.test(file.name)) { setError("Choose a JPG, PNG, WebP or HEIC picture."); return; }
    if (file.size > MAX_IMAGE_BYTES) { setError("Pictures must be 10 MB or smaller."); return; }
    void upload(file);
  }

  async function removePicture() {
    const r = await removeBoardPicture();
    if (!r.ok) { setError(r.message); return; }
    setCustomSrc(null);
    if (bg.id === "custom") setBg(resolveBoardBackground({ id: "gradient", veil: null, customSrc: null }));
  }

  const options: { id: BoardBackgroundId; label: string; thumb: string | null }[] = [
    ...BOARD_PRESETS.map((p) => ({ id: p.id as BoardBackgroundId, label: p.label, thumb: p.src ? thumbOf(p.src) : null })),
    ...(customSrc ? [{ id: "custom" as const, label: "Your picture", thumb: customSrc }] : []),
  ];
  const busy = progress !== null;
  const ok = contrast ? contrast.muted >= AA : true;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" icon={<ImageIcon aria-hidden="true" />}>Background</Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-4">
        <h2 id={`${uid}-title`} className="text-sm font-semibold text-foreground">Board background</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Only you see this. It follows your account.</p>

        <RadioGroup value={bg.id} onValueChange={choose} aria-labelledby={`${uid}-title`} className="mt-3 grid grid-cols-3 gap-2">
          {options.map((o) => (
            <label key={o.id}
              className={cn(
                "group flex cursor-pointer flex-col gap-1 rounded-lg p-1 text-xs text-muted-foreground transition-colors duration-150 hover:bg-muted",
                "has-[[data-state=checked]]:bg-accent has-[[data-state=checked]]:text-accent-foreground",
                "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
              )}>
              <span className="relative block aspect-[5/3] overflow-hidden rounded-md border border-border group-has-[[data-state=checked]]:border-primary group-has-[[data-state=checked]]:ring-2 group-has-[[data-state=checked]]:ring-primary">
                {o.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element -- tiny local thumbs and the person's own Cloudinary picture
                  <img src={o.thumb} alt="" className="size-full object-cover" />
                ) : (
                  <span className="flex size-full items-center justify-center bg-muted text-foreground-muted"><LayoutGrid aria-hidden="true" className="size-4" /></span>
                )}
              </span>
              <span className="truncate px-0.5 font-medium">{o.label}</span>
              <RadioGroupItem value={o.id} aria-label={o.label} className="sr-only" />
            </label>
          ))}
        </RadioGroup>
        {busy ? <span role="status" className="sr-only">{`Uploading ${progress}%`}</span> : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {/* A label styled as the outline button: the file input inside it opens the picker (keyboard: it takes focus itself). */}
          <label aria-disabled={busy || undefined}
            className={cn(
              "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-border-strong bg-card px-3 text-xs font-medium text-foreground transition-colors duration-150 hover:border-primary [&_svg]:size-4",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
              busy && "cursor-wait opacity-70",
            )}>
            <ImagePlus aria-hidden="true" />
            {busy ? <span className="tabular-nums">Uploading {progress}%</span> : customSrc ? "Replace your picture" : "Upload a picture"}
            <input type="file" accept="image/jpeg,image/png,image/webp,.heic" className="sr-only" disabled={busy} onChange={onFile} />
          </label>
          {customSrc ? (
            <Button variant="ghost" size="sm" icon={<Trash2 aria-hidden="true" />} onClick={() => void removePicture()}>Remove</Button>
          ) : null}
        </div>

        {bg.id !== "plain" ? (
          <div className="mt-4 border-t border-border pt-4">
            <div className="flex items-center justify-between text-xs font-medium text-foreground">
              <span id={`${uid}-veil`}>Veil</span>
              <span className="text-muted-foreground tabular-nums">{valueText(bg.veil)}</span>
            </div>
            <Slider className="mt-3" min={-100} max={100} step={1} value={[bg.veil]} showRange={false}
              trackClassName="data-[orientation=horizontal]:h-2 bg-gradient-to-r from-white to-[#061034] ring-1 ring-border-strong"
              thumbProps={{ "aria-label": "Veil, from light to dark", "aria-valuetext": valueText(bg.veil) }}
              onValueChange={([v]) => setBg({ ...bg, veil: v })}
              onValueCommit={([v]) => void save({ ...bg, veil: v })} />
            <div aria-hidden="true" className="mt-1.5 flex justify-between text-xs text-muted-foreground">
              <span>Light</span><span>None</span><span>Dark</span>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              {contrast ? (
                <p className={cn("text-xs", ok ? "text-muted-foreground" : "text-danger")}>
                  Text contrast <span className="font-semibold tabular-nums">{contrast.muted.toFixed(1)}:1</span> · {ok ? "easy to read" : "hard to read"}
                </p>
              ) : unreadable ? (
                <p className="text-xs text-muted-foreground">Contrast can&apos;t be measured for this picture.</p>
              ) : (
                <p className="text-xs text-muted-foreground">Measuring…</p>
              )}
              {contrast && !ok ? (
                <Button variant="ghost" size="sm" icon={<WandSparkles aria-hidden="true" />} onClick={makeReadable}>Make readable</Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {error ? <p role="alert" className="mt-2 text-xs text-danger">{error}</p> : null}
      </PopoverContent>
    </Popover>
  );
}

