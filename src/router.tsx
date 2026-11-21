import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { appShellQuery, MemberScreen } from "@/components/member-screen";
import { backLinkClass, PageHeading } from "@/components/project-parts";
import { Skeleton } from "@/components/ui/skeleton";
import { describeError, recordProblem } from "@/lib/diagnostics";
import { routeTree } from "./routeTree.gen";

function PageNotFound() {
  return (
    <MemberScreen query={appShellQuery} skeleton={<Skeleton className="h-40" />}>
      {() => (
        <div className="flex flex-col gap-2">
          <Link to="/" className={backLinkClass}>
            <ChevronLeft className="size-4" aria-hidden /> Back to Projects
          </Link>
          <PageHeading title="Page not found" />
          <p className="text-muted-foreground">Go back to see the Projects you can open.</p>
        </div>
      )}
    </MemberScreen>
  );
}

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000 } },
    // Failed server calls go into the next Site feedback report.
    queryCache: new QueryCache({
      onError: (error, query) =>
        recordProblem("query", `${JSON.stringify(query.queryKey)}: ${describeError(error)}`),
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) =>
        recordProblem(
          "action",
          `${JSON.stringify(mutation.options.mutationKey ?? "unnamed")}: ${describeError(error)}`,
        ),
    }),
  });
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
    defaultNotFoundComponent: PageNotFound,
    scrollRestoration: true,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
