import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { describeError, recordProblem } from "@/lib/diagnostics";
import { routeTree } from "./routeTree.gen";

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
    scrollRestoration: true,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
