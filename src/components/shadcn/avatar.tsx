"use client"

import * as React from "react"
import { cn } from "@/components/ui/cn"
import { Avatar as AvatarPrimitive } from "radix-ui"

/** Round container (24 to 36px sizes are set by the kit `Avatar`, which composes this). */
function Avatar({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn("relative flex size-7 shrink-0 overflow-hidden rounded-full text-xs select-none", className)}
      {...props}
    />
  )
}

/** The photo. Radix renders it only once it has loaded; until then (and on error) the fallback shows. */
function AvatarImage({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full object-cover", className)}
      {...props}
    />
  )
}

/** Initials (or an icon) shown when there is no photo. Inherits the size of the container's text. */
function AvatarFallback({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn("flex size-full items-center justify-center rounded-full bg-muted text-muted-foreground", className)}
      {...props}
    />
  )
}

export { Avatar, AvatarImage, AvatarFallback }
