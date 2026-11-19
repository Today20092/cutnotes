"use client";

import { FieldLegend, FieldSet } from "@ui-sdk/react/field";
import type React from "react";
import { cn } from "@/lib/utils";

export function Fieldset({
  className,
  ...props
}: React.ComponentProps<typeof FieldSet>): React.ReactElement {
  return <FieldSet className={cn("flex w-full max-w-64 flex-col gap-6", className)} {...props} />;
}

export function FieldsetLegend({
  className,
  ...props
}: React.ComponentProps<typeof FieldLegend>): React.ReactElement {
  return <FieldLegend className={cn("font-semibold text-foreground", className)} {...props} />;
}
