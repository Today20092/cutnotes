"use client";

import {
  Menu as MenuPrimitive,
  MenuContent,
  MenuGroup,
  MenuItem as MenuItemPrimitive,
  MenuSeparator as MenuSeparatorPrimitive,
  MenuTrigger,
} from "@ui-sdk/react/menu";
import type * as React from "react";
import { cn } from "@/lib/utils";

export const Menu = MenuPrimitive;

export { MenuGroup, MenuTrigger };

export function MenuPopup({
  children,
  className,
  sideOffset = 4,
  align = "center",
  side = "bottom",
  ...props
}: Omit<React.ComponentProps<typeof MenuContent>, "children"> & {
  children?: React.ReactNode;
}): React.ReactElement {
  return (
    <MenuContent
      align={align}
      className={cn(
        "relative flex not-[class*='w-']:min-w-32 origin-(--transform-origin) rounded-lg border bg-popover p-0 text-popover-foreground not-dark:bg-clip-padding shadow-lg/5 outline-none before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-lg)-1px)] before:shadow-[0_1px_--theme(--color-black/4%)] focus:outline-none dark:before:shadow-[0_-1px_--theme(--color-white/6%)]",
        className,
      )}
      side={side}
      sideOffset={sideOffset}
      {...props}
    >
      <div className="max-h-(--available-height) w-full overflow-y-auto p-1">{children}</div>
    </MenuContent>
  );
}

export function MenuItem({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof MenuItemPrimitive> & {
  variant?: "default" | "destructive";
}): React.ReactElement {
  return (
    <MenuItemPrimitive
      className={cn(
        "flex min-h-11 cursor-default select-none items-center gap-2 rounded-sm px-2 py-1 text-base text-foreground outline-none data-disabled:pointer-events-none data-highlighted:bg-accent data-destructive:text-destructive-foreground data-highlighted:text-accent-foreground data-disabled:opacity-64 sm:pointer-fine:min-h-7 sm:text-sm [&>svg:not([class*='opacity-'])]:opacity-80 [&>svg:not([class*='size-'])]:size-4.5 sm:[&>svg:not([class*='size-'])]:size-4 [&>svg]:pointer-events-none [&>svg]:-mx-0.5 [&>svg]:shrink-0",
        className,
      )}
      destructive={variant === "destructive"}
      {...props}
    />
  );
}

export function MenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof MenuSeparatorPrimitive>): React.ReactElement {
  return <MenuSeparatorPrimitive className={cn("mx-2 my-1 h-px bg-border", className)} {...props} />;
}
