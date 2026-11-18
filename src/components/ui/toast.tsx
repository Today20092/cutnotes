"use client";

import { OverlayHost } from "@ui-sdk/react/overlays";
import {
  Toast,
  ToastAction,
  ToastDescription,
  ToastRegion,
  ToastTitle,
  type ToastData,
  type ToastRegionProps,
} from "@ui-sdk/react/toast";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  InfoIcon,
  LoaderCircleIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type React from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export { createToaster, toast } from "@ui-sdk/react/toast";

const TOAST_ICONS = {
  error: CircleAlertIcon,
  info: InfoIcon,
  loading: LoaderCircleIcon,
  success: CircleCheckIcon,
  warning: TriangleAlertIcon,
} as const;

const regionClass =
  "fixed inset-auto m-0 h-(--toast-front-height) w-[calc(100%-var(--toast-inset)*2)] max-w-90 overflow-visible border-0 bg-transparent p-0 [--toast-inset:--spacing(4)] sm:[--toast-inset:--spacing(8)] data-expanded:h-[calc(var(--toast-stack-height)+(var(--toast-count)-1)*var(--toast-gap))] [--toast-gap:--spacing(3)] data-[side=top]:top-(--toast-inset) data-[side=bottom]:bottom-(--toast-inset) data-[align=start]:left-(--toast-inset) data-[align=end]:right-(--toast-inset) data-[align=center]:left-1/2 data-[align=center]:-translate-x-1/2";

const toastClass = cn(
  "absolute inset-x-0 z-[calc(100-var(--toast-index))] h-(--toast-height) select-none overflow-hidden rounded-lg border bg-popover not-dark:bg-clip-padding text-popover-foreground shadow-lg/5 [transition-property:translate,scale,opacity,height] duration-400 ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:[transition-property:opacity]",
  "[translate:var(--toast-swipe-x,0px)_calc(var(--y)+var(--toast-swipe-y,0px))] [scale:calc(1-var(--toast-index)*0.05)] data-expanded:[scale:1]",
  "not-data-front:not-data-expanded:h-(--toast-front-height)",
  "in-data-[side=top]:top-0 in-data-[side=top]:origin-top in-data-[side=top]:[--y:calc(var(--toast-index)*var(--toast-gap))] in-data-[side=top]:data-expanded:[--y:calc(var(--toast-offset)+var(--toast-index)*var(--toast-gap))] in-data-[side=top]:data-front:data-starting-style:[--y:-100%]",
  "in-data-[side=bottom]:bottom-0 in-data-[side=bottom]:origin-bottom in-data-[side=bottom]:[--y:calc(var(--toast-index)*var(--toast-gap)*-1)] in-data-[side=bottom]:data-expanded:[--y:calc((var(--toast-offset)+var(--toast-index)*var(--toast-gap))*-1)] in-data-[side=bottom]:data-front:data-starting-style:[--y:100%]",
  "data-starting-style:transition-none data-swiping:transition-none data-ending-style:opacity-0 data-starting-style:not-data-front:opacity-0",
);

function renderToast(toast: ToastData<React.ReactNode>): React.ReactNode {
  const Icon = toast.type ? TOAST_ICONS[toast.type as keyof typeof TOAST_ICONS] : null;
  const passive = (toast.data as { passive?: boolean } | undefined)?.passive;
  return (
    <Toast className={cn(toastClass, passive && "pointer-events-none")}>
      <div className="flex items-center justify-between gap-1.5 px-3.5 py-3 text-sm">
        <div className="flex gap-2">
          {Icon && (
            <div className="[&>svg]:h-lh [&>svg]:w-4 [&_svg]:pointer-events-none [&_svg]:shrink-0">
              <Icon className="in-data-[type=loading]:animate-spin in-data-[type=error]:text-destructive in-data-[type=info]:text-info in-data-[type=success]:text-success in-data-[type=warning]:text-warning in-data-[type=loading]:opacity-80" />
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            <ToastTitle className="font-medium" />
            <ToastDescription className="text-muted-foreground" />
          </div>
        </div>
        <ToastAction className={cn(buttonVariants({ size: "xs" }), "pointer-events-auto")} />
      </div>
    </Toast>
  );
}

/** Mounts the app-wide region that `toast()` opens into. */
export function ToastProvider({
  children,
  side = "top",
  align = "center",
}: {
  children?: React.ReactNode;
  side?: ToastRegionProps["side"];
  align?: ToastRegionProps["align"];
}): React.ReactElement {
  return (
    <>
      {children}
      <OverlayHost toast={{ side, align, className: regionClass, children: renderToast }} />
    </>
  );
}

/** A region for its own toaster from `createToaster()`, so its toasts don't mix with the app's. */
export function Toasts({ className, ...props }: ToastRegionProps): React.ReactElement {
  return <ToastRegion className={cn(regionClass, className)} {...props}>{renderToast}</ToastRegion>;
}
