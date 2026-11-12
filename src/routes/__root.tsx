import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { AuthProvider } from "@/auth/client";
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
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <Outlet />
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
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
    links: [{ rel: "stylesheet", href: stylesUrl }],
  }),
  shellComponent: RootShell,
  component: Root,
});
