"use client";

import {
  Progress as ProgressPrimitive,
  ProgressIndicator as ProgressIndicatorPrimitive,
  ProgressLabel as ProgressLabelPrimitive,
  ProgressTrack as ProgressTrackPrimitive,
  ProgressValue as ProgressValuePrimitive,
} from "@ui-sdk/react/progress";
import type React from "react";
import { cn } from "@/lib/utils";

export function Progress({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive>): React.ReactElement {
  return (
    <ProgressPrimitive
      className={cn("flex w-full flex-col gap-2", className)}
      {...props}
    >
      {children ? (
        children
      ) : (
        <ProgressTrack>
          <ProgressIndicator />
        </ProgressTrack>
      )}
    </ProgressPrimitive>
  );
}

export function ProgressLabel({
  className,
  ...props
}: React.ComponentProps<typeof ProgressLabelPrimitive>): React.ReactElement {
  return (
    <ProgressLabelPrimitive
      className={cn("font-medium text-sm", className)}
      {...props}
    />
  );
}

export function ProgressTrack({
  className,
  ...props
}: React.ComponentProps<typeof ProgressTrackPrimitive>): React.ReactElement {
  return (
    <ProgressTrackPrimitive
      className={cn(
        "block h-1.5 w-full overflow-hidden rounded-full bg-input",
        className,
      )}
      {...props}
    />
  );
}

export function ProgressIndicator({
  className,
  ...props
}: React.ComponentProps<typeof ProgressIndicatorPrimitive>): React.ReactElement {
  return (
    <ProgressIndicatorPrimitive
      className={cn("w-full bg-primary transition-all duration-500", className)}
      {...props}
    />
  );
}

export function ProgressValue({
  className,
  ...props
}: React.ComponentProps<typeof ProgressValuePrimitive>): React.ReactElement {
  return (
    <ProgressValuePrimitive
      className={cn("text-sm tabular-nums", className)}
      {...props}
    />
  );
}
