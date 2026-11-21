"use client";

import {
  Collapsible as CollapsiblePrimitive,
  CollapsiblePanel as CollapsiblePanelPrimitive,
  CollapsibleTrigger as CollapsibleTriggerPrimitive,
} from "@ui-sdk/react/collapsible";
import type React from "react";
import { cn } from "@/lib/utils";

export const Collapsible = CollapsiblePrimitive;

export function CollapsibleTrigger({
  className,
  ...props
}: React.ComponentProps<typeof CollapsibleTriggerPrimitive>): React.ReactElement {
  return <CollapsibleTriggerPrimitive className={cn("cursor-pointer", className)} {...props} />;
}

export function CollapsiblePanel({
  className,
  ...props
}: React.ComponentProps<typeof CollapsiblePanelPrimitive>): React.ReactElement {
  return (
    <CollapsiblePanelPrimitive
      className={cn(
        "h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 data-ending-style:h-0 data-starting-style:h-0",
        className,
      )}
      {...props}
    />
  );
}

export { CollapsiblePanel as CollapsibleContent };
