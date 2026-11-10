import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AuthProvider } from "@/auth/client";
import { ToastProvider } from "@/components/ui/toast";
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

function Root() {
  const { queryClient } = Route.useRouteContext();
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider position="top-center">
          <Outlet />
        </ToastProvider>
      </QueryClientProvider>
    </AuthProvider>
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
});
