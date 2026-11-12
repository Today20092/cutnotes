import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { AuthProvider } from "@/auth/client";
import { SiteFeedback } from "@/components/site-feedback";
import { Button } from "@/components/ui/button";
import { describeError, recordProblem, watchProblems } from "@/lib/diagnostics";
import stylesUrl from "@/styles.css?url";

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

// Loaded on the client only: the Toast module sets up shared state when it loads, and a Worker
// must not do that at startup or while rendering.
const ToastProvider = lazy(() =>
  import("@/components/ui/toast").then((module) => ({ default: module.ToastProvider })),
);

function Toaster() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? (
    <Suspense fallback={null}>
      <ToastProvider position="top-center" />
    </Suspense>
  ) : null;
}

function Root() {
  const { queryClient } = Route.useRouteContext();
  useEffect(watchProblems, []);
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <Outlet />
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}

/** Any screen that throws lands here, with a way to report it. Needs no sign-in. */
function RootError({ error }: ErrorComponentProps) {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => recordProblem("screen", describeError(error)), [error]);
  return (
    <QueryClientProvider client={queryClient}>
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="text-muted-foreground">Reload the page to try again.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => location.reload()}>Reload</Button>
          <SiteFeedback error={error} />
        </div>
      </main>
      <Toaster />
    </QueryClientProvider>
  );
}

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "color-scheme", content: "light dark" },
      { title: "Cutnotes" },
    ],
    links: [{ rel: "stylesheet", href: stylesUrl }],
  }),
  shellComponent: RootShell,
  component: Root,
  errorComponent: RootError,
});
