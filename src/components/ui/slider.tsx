"use client";

import {
  Slider as SliderPrimitive,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
  SliderValue as SliderValuePrimitive,
} from "@ui-sdk/react/slider";
import * as React from "react";
import { cn } from "@/lib/utils";

export function Slider({
  className,
  children,
  defaultValue,
  value,
  min = 0,
  max = 100,
  thumbProps,
  ...props
}: Omit<React.ComponentProps<typeof SliderPrimitive>, "children"> & {
  children?: React.ReactNode;
  thumbProps?: Partial<React.ComponentProps<typeof SliderThumb>>;
}): React.ReactElement {
  const initial = value ?? defaultValue;
  const count = Array.isArray(initial) ? initial.length : 1;

  return (
    <SliderPrimitive
      className={cn("data-[orientation=horizontal]:w-full", className)}
      defaultValue={defaultValue}
      max={max}
      min={min}
      value={value}
      {...props}
    >
      {children}
      <SliderControl className="flex touch-none select-none data-disabled:pointer-events-none data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=horizontal]:w-full data-[orientation=horizontal]:min-w-44 data-[orientation=vertical]:flex-col data-disabled:opacity-64">
        <SliderTrack className="relative grow select-none before:absolute before:rounded-full before:bg-input data-[orientation=horizontal]:h-1 data-[orientation=vertical]:h-full data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-1 data-[orientation=horizontal]:before:inset-x-0.5 data-[orientation=vertical]:before:inset-x-0 data-[orientation=horizontal]:before:inset-y-0 data-[orientation=vertical]:before:inset-y-0.5">
          <SliderIndicator className="select-none rounded-full bg-primary data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full" />
          {Array.from({ length: count }, (_, index) => (
            <SliderThumb
              className="block size-5 shrink-0 select-none rounded-full border border-input bg-white not-dark:bg-clip-padding shadow-xs/5 outline-none transition-[box-shadow,scale] before:absolute before:inset-0 before:rounded-full before:shadow-[0_1px_--theme(--color-black/4%)] has-focus-visible:ring-[3px] has-focus-visible:ring-ring/24 data-dragging:scale-120 sm:size-4 dark:border-background dark:has-focus-visible:ring-ring/48 [:has(*:focus-visible),[data-dragging]]:shadow-none"
              index={index}
              key={String(index)}
              {...thumbProps}
            />
          ))}
        </SliderTrack>
      </SliderControl>
    </SliderPrimitive>
  );
}

export function SliderValue({
  className,
  ...props
}: React.ComponentProps<typeof SliderValuePrimitive>): React.ReactElement {
  return <SliderValuePrimitive className={cn("flex justify-end text-sm", className)} {...props} />;
}
