"use client";

import { Tooltip as TooltipPrimitive, TooltipContent, TooltipTrigger } from "@ui-sdk/react/tooltip";
import type React from "react";
import { cn } from "@/lib/utils";

export const Tooltip = TooltipPrimitive;

export { TooltipTrigger };

export function TooltipPopup({
  className,
  align = "center",
  sideOffset = 4,
  side = "top",
  ...props
}: React.ComponentProps<typeof TooltipContent>): React.ReactElement {
  return (
    <TooltipContent
      align={align}
      className={cn(
        "relative z-50 flex max-w-(--available-width) origin-(--transform-origin) text-balance rounded-md border bg-popover not-dark:bg-clip-padding px-2 py-1 text-popover-foreground text-xs shadow-md/5 transition-[scale,opacity] before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-md)-1px)] before:shadow-[0_1px_--theme(--color-black/4%)] data-ending-style:scale-98 data-starting-style:scale-98 data-ending-style:opacity-0 data-starting-style:opacity-0 dark:before:shadow-[0_-1px_--theme(--color-white/6%)]",
        className,
      )}
      side={side}
      sideOffset={sideOffset}
      {...props}
    />
  );
}

export { TooltipPopup as TooltipContent };
