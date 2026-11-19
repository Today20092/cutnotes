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

function Toaster({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const loading = (
    <main aria-busy="true">
      <h1 className="sr-only">Loading</h1>
    </main>
  );
  return mounted ? (
    <Suspense fallback={loading}>
      <ToastProvider>{children}</ToastProvider>
    </Suspense>
  ) : (
    loading
  );
}

// Dev builds only: production replaces DEV with false and drops the import.
const AgentPanel = import.meta.env.DEV ? lazy(() => import("@/components/agent-panel")) : null;
const showAgent = () =>
  import.meta.env.MODE !== "e2e" || new URLSearchParams(location.search).has("agent");

function Root() {
  const { queryClient } = Route.useRouteContext();
  useEffect(watchProblems, []);
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <Toaster>
          <Outlet />
          {AgentPanel && showAgent() && (
            <Suspense>
              <AgentPanel />
            </Suspense>
          )}
        </Toaster>
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
      <Toaster>
        <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-title">Something went wrong</h1>
          <p className="text-muted-foreground">Reload the page to try again.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => location.reload()}>Reload</Button>
            <SiteFeedback error={error} />
          </div>
        </main>
      </Toaster>
    </QueryClientProvider>
  );
}

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  // Public link routes load preview metadata on the server; UI stays client-rendered.
  ssr: "data-only",
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "color-scheme", content: "light dark" },
      { title: "Cutnotes" },
    ],
    // The route index for agents: every screen's URL, params and purpose.
    links: [
      { rel: "stylesheet", href: stylesUrl },
      { rel: "help", href: "/llms.txt", type: "text/plain" },
    ],
  }),
  shellComponent: RootShell,
  component: Root,
  errorComponent: RootError,
});
