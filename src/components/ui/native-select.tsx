import type { ComponentProps } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** One native keyboard/touch interaction with a consistently inset arrow. */
export function NativeSelect({ className, children, ...props }: ComponentProps<"select">) {
  return <span className="relative inline-grid min-w-0 items-center">
    <select {...props} className={cn("h-11 min-w-0 max-w-full appearance-none rounded-lg border-0 bg-muted py-1 pl-3 pr-9 text-sm font-medium text-foreground outline-none hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 sm:h-8", className)}>
      {children}
    </select>
    <ChevronDown className="pointer-events-none absolute right-3 size-4 text-muted-foreground" aria-hidden />
  </span>;
}
