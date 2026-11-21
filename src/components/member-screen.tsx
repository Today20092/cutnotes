import { queryOptions, useQuery, type QueryKey, type UseQueryOptions } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { useAuthStatus } from "@/auth/client";
import { AppShell } from "@/components/app-shell";
import { NotAMemberScreen, SignInScreen } from "@/components/gate-screens";
import { SiteFeedback } from "@/components/site-feedback";
import { Skeleton } from "@/components/ui/skeleton";
import { useTeam } from "@/lib/team";
import { getAppShell } from "@/server/app-shell";

const isRefusal = (error: unknown, status: number) =>
  error instanceof Response && error.status === status;

/** Shared across screens so Clerk profile refreshes do not run on every navigation. */
export const appShellQuery = queryOptions({
  queryKey: ["app-shell"],
  queryFn: () => getAppShell(),
  staleTime: 5 * 60_000,
  retry: false,
});

/**
 * Sign-in and refusal states come from the screen's server call; the cached
 * account query supplies the avatar without delaying the screen's content.
 */
export function MemberScreen<Data, Key extends QueryKey>({
  query,
  skeleton,
  notFound,
  children,
}: {
  query: UseQueryOptions<Data, Error, Data, Key>;
  skeleton: ReactNode;
  notFound?: ReactNode;
  children: (data: Data) => ReactNode;
}) {
  const { isLoaded, isSignedIn } = useAuthStatus();
  const team = useTeam();
  const screen = useQuery({ ...query, enabled: isLoaded && isSignedIn });
  const profile = useQuery({ ...appShellQuery, enabled: isLoaded && isSignedIn });
  const isNotFound = Boolean(notFound) && isRefusal(screen.error, 404);

  if (!isLoaded || !team.data)
    return (
      <main aria-busy="true">
        <h1 className="sr-only">Loading</h1>
        <Skeleton className="m-6 h-40" />
        <SlowLoadFeedback />
      </main>
    );
  if (!isSignedIn || isRefusal(screen.error, 401)) {
    return <SignInScreen team={team.data} />;
  }
  if (isRefusal(screen.error, 403)) {
    return <NotAMemberScreen team={team.data} />;
  }

  let content: ReactNode;
  if (isNotFound) {
    content = notFound;
  } else if (screen.isError) {
    content = (
      <>
        <h1>Unable to load page</h1>
        <p role="alert">Something went wrong. Please reload the page.</p>
        <SiteFeedback error={screen.error} />
      </>
    );
  } else {
    content =
      screen.data === undefined ? (
        <div aria-busy="true">
          <h1 className="sr-only">Loading</h1>
          {skeleton}
        </div>
      ) : (
        children(screen.data)
      );
  }
  return (
    <AppShell team={team.data} member={profile.data?.member}>
      {content}
    </AppShell>
  );
}

/** Shown only when loading takes long, which is how a broken sign-in looks. */
function SlowLoadFeedback() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 5000);
    return () => window.clearTimeout(timer);
  }, []);
  return slow ? (
    <p className="m-6 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      Still loading? <SiteFeedback error="The page stayed on its loading screen." />
    </p>
  ) : null;
}
