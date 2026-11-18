"use client";

import {
  Select as SelectPrimitive,
  SelectContent,
  SelectGroup as SelectGroupPrimitive,
  SelectGroupLabel as SelectGroupLabelPrimitive,
  SelectItem as SelectItemPrimitive,
  SelectItemIndicator,
  SelectItemText,
  SelectLabel as SelectLabelPrimitive,
  SelectSeparator as SelectSeparatorPrimitive,
  SelectTrigger as SelectTriggerPrimitive,
  SelectValue as SelectValuePrimitive,
} from "@ui-sdk/react/select";
import { cva, type VariantProps } from "class-variance-authority";
import { ChevronsUpDownIcon } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

export const Select = SelectPrimitive;

export const selectTriggerVariants = cva(
  "relative inline-flex min-h-9 w-full min-w-36 select-none items-center justify-between gap-2 rounded-lg border border-input bg-background not-dark:bg-clip-padding px-[calc(--spacing(3)-1px)] text-left text-base text-foreground shadow-xs/5 outline-none ring-ring/24 transition-shadow before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-lg)-1px)] not-data-disabled:not-focus-visible:not-aria-invalid:not-data-pressed:before:shadow-[0_1px_--theme(--color-black/4%)] pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 focus-visible:border-ring focus-visible:ring-[3px] aria-invalid:border-destructive/36 focus-visible:aria-invalid:border-destructive/64 focus-visible:aria-invalid:ring-destructive/16 data-disabled:pointer-events-none data-disabled:opacity-64 sm:min-h-8 sm:text-sm dark:bg-input/32 dark:aria-invalid:ring-destructive/24 dark:not-data-disabled:not-focus-visible:not-aria-invalid:not-data-pressed:before:shadow-[0_-1px_--theme(--color-white/6%)] [&_svg:not([class*='opacity-'])]:opacity-80 [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0 [[data-disabled],:focus-visible,[aria-invalid],[data-pressed]]:shadow-none",
  {
    defaultVariants: {
      size: "default",
    },
    variants: {
      size: {
        default: "",
        lg: "min-h-10 sm:min-h-9",
        sm: "min-h-8 gap-1.5 px-[calc(--spacing(2.5)-1px)] sm:min-h-7",
      },
    },
  },
);

export const selectTriggerIconClassName = "-me-1 size-4.5 opacity-80 sm:size-4";

export function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: Omit<React.ComponentProps<typeof SelectTriggerPrimitive>, "children"> & { children?: React.ReactNode } &
  VariantProps<typeof selectTriggerVariants>): React.ReactElement {
  return (
    <SelectTriggerPrimitive className={cn(selectTriggerVariants({ size }), className)} {...props}>
      {children}
      <ChevronsUpDownIcon aria-hidden className={selectTriggerIconClassName} />
    </SelectTriggerPrimitive>
  );
}

export function SelectValue({
  className,
  ...props
}: React.ComponentProps<typeof SelectValuePrimitive>): React.ReactElement {
  return (
    <SelectValuePrimitive
      className={cn("flex-1 truncate data-placeholder:text-muted-foreground", className)}
      {...props}
    />
  );
}

export function SelectPopup({
  className,
  side = "bottom",
  sideOffset = 4,
  align = "start",
  alignOffset = 0,
  alignItemWithTrigger = true,
  ...props
}: React.ComponentProps<typeof SelectContent>): React.ReactElement {
  return (
    <SelectContent
      align={align}
      alignItemWithTrigger={alignItemWithTrigger}
      alignOffset={alignOffset}
      className={cn(
        "max-h-(--available-height) min-w-(--anchor-width) origin-(--transform-origin) select-none overflow-y-auto rounded-lg border bg-popover p-1 text-foreground not-dark:bg-clip-padding shadow-lg/5 outline-none",
        className,
      )}
      side={side}
      sideOffset={sideOffset}
      {...props}
    />
  );
}

export function SelectItem({
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof SelectItemPrimitive>, "children"> & {
  children?: React.ReactNode;
}): React.ReactElement {
  return (
    <SelectItemPrimitive
      className={cn(
        "grid min-h-8 cursor-default grid-cols-[1rem_1fr] items-center gap-2 rounded-sm py-1 ps-2 pe-4 text-base outline-none data-disabled:pointer-events-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:opacity-64 sm:min-h-7 sm:text-sm [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      <SelectItemIndicator className="col-start-1">
        <svg
          aria-hidden="true"
          fill="none"
          height="24"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width="24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M5.252 12.7 10.2 18.63 18.748 5.37" />
        </svg>
      </SelectItemIndicator>
      <SelectItemText className="col-start-2 min-w-0">{children}</SelectItemText>
    </SelectItemPrimitive>
  );
}

export function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectSeparatorPrimitive>): React.ReactElement {
  return <SelectSeparatorPrimitive className={cn("mx-2 my-1 h-px bg-border", className)} {...props} />;
}

export const SelectGroup = SelectGroupPrimitive;

export function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectLabelPrimitive>): React.ReactElement {
  return (
    <SelectLabelPrimitive
      className={cn(
        "not-in-data-[slot=field]:mb-2 inline-flex cursor-default items-center gap-2 font-medium text-base/4.5 text-foreground sm:text-sm/4",
        className,
      )}
      {...props}
    />
  );
}

export function SelectGroupLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectGroupLabelPrimitive>): React.ReactElement {
  return (
    <SelectGroupLabelPrimitive
      className={cn("px-2 py-1.5 font-medium text-muted-foreground text-xs", className)}
      {...props}
    />
  );
}

export { SelectPopup as SelectContent };
