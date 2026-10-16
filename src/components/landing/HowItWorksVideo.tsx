"use client";

import { useState } from "react";
import { CirclePlay } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/shadcn/dialog";

/** The 18-second product intro (1920×1080, H.264 + AAC): a brief sent, feedback on the work, approval. */
export const HOW_IT_WORKS_VIDEO = "/landing/how-it-works.mp4";

/**
 * The hero's "See how it works": opens the intro video in a dialog and starts it. It stays a link to the "How a request
 * moves" section, so it still goes somewhere before hydration or without JavaScript. Closing the dialog unmounts the
 * video, which stops it.
 */
export function HowItWorksVideo({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <a href="#how" className={className} onClick={(e) => { e.preventDefault(); setOpen(true); }}>
        <CirclePlay aria-hidden="true" />See how it works
      </a>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl gap-3 p-3 sm:p-4">
          <DialogHeader className="px-1 pt-1">
            <DialogTitle>See how Cloworks works</DialogTitle>
            <DialogDescription>Send a brief, get feedback on the work, approve it. 18 seconds.</DialogDescription>
          </DialogHeader>
          <video src={HOW_IT_WORKS_VIDEO} controls autoPlay playsInline preload="auto"
            className="aspect-video w-full rounded-lg bg-black">
            <a href={HOW_IT_WORKS_VIDEO}>Download the video</a>
          </video>
        </DialogContent>
      </Dialog>
    </>
  );
}
