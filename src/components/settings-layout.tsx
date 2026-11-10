import type { ReactNode } from "react";

/** Shared reading width and spacing for account and team administration. */
export function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 py-4 sm:py-8">{children}</div>
  );
}
