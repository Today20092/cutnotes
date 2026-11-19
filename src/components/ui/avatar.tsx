"use client";

import {
  Avatar as AvatarRoot,
  AvatarFallback as AvatarFallbackPrimitive,
  AvatarImage as AvatarImagePrimitive,
} from "@ui-sdk/react/avatar";
import type React from "react";
import { cn } from "@/lib/utils";

export function Avatar({
  className,
  ...props
}: React.ComponentProps<typeof AvatarRoot>): React.ReactElement {
  return (
    <AvatarRoot
      className={cn(
        "inline-flex size-8 shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-background align-middle font-medium text-xs",
        className,
      )}
      {...props}
    />
  );
}

export function AvatarImage({
  className,
  ...props
}: React.ComponentProps<typeof AvatarImagePrimitive>): React.ReactElement {
  return <AvatarImagePrimitive className={cn("size-full object-cover", className)} {...props} />;
}

export function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarFallbackPrimitive>): React.ReactElement {
  return (
    <AvatarFallbackPrimitive
      className={cn("flex size-full items-center justify-center rounded-full bg-muted", className)}
      {...props}
    />
  );
}
