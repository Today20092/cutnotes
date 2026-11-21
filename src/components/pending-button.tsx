import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/** Keep the action label visible while preventing repeated submissions. */
export function PendingButton({
  pending,
  disabled,
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, "children"> & { pending: boolean; children?: ReactNode }) {
  return (
    <Button {...props} disabled={pending || disabled} aria-busy={pending || undefined}>
      {pending && <Spinner data-icon="inline-start" aria-hidden role="presentation" />}
      {children}
    </Button>
  );
}
