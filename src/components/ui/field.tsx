"use client";

import {
  Field as FieldPrimitive,
  FieldDescription as FieldDescriptionPrimitive,
  FieldError as FieldErrorPrimitive,
  FieldLabel as FieldLabelPrimitive,
} from "@ui-sdk/react/field";
import type React from "react";
import { cn } from "@/lib/utils";

export function Field({
  className,
  ...props
}: React.ComponentProps<typeof FieldPrimitive>): React.ReactElement {
  return <FieldPrimitive className={cn("flex flex-col items-start gap-2", className)} {...props} />;
}

export function FieldLabel({
  className,
  ...props
}: React.ComponentProps<typeof FieldLabelPrimitive>): React.ReactElement {
  return (
    <FieldLabelPrimitive
      className={cn(
        "inline-flex items-center gap-2 font-medium text-base/4.5 text-foreground data-disabled:opacity-64 sm:text-sm/4",
        className,
      )}
      {...props}
    />
  );
}

export function FieldDescription({
  className,
  ...props
}: React.ComponentProps<typeof FieldDescriptionPrimitive>): React.ReactElement {
  return (
    <FieldDescriptionPrimitive
      className={cn("text-muted-foreground text-xs", className)}
      {...props}
    />
  );
}

export function FieldError({
  className,
  ...props
}: React.ComponentProps<typeof FieldErrorPrimitive>): React.ReactElement {
  return (
    <FieldErrorPrimitive
      className={cn("text-destructive-foreground text-xs", className)}
      {...props}
    />
  );
}
