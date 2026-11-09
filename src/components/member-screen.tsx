import { useQuery, type QueryKey, type UseQueryOptions } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useAuthStatus } from "@/auth/client";
import { AppShell } from "@/components/app-shell";
import { NotAMemberScreen, SignInScreen } from "@/components/gate-screens";
import { Skeleton } from "@/components/ui/skeleton";
import { useTeam } from "@/lib/team";

const isRefusal = (error: unknown, status: number) =>
  error instanceof Response && error.status === status;

/**
 * A screen whose single server call also answers who the caller is. Sign-in
 * and refusal states come from that call, and loading stays inside the shell.
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
  const isNotFound = Boolean(notFound) && isRefusal(screen.error, 404);

  if (!isLoaded || !team.data)
    return (
      <main aria-busy="true">
        <h1 className="sr-only">Loading</h1>
        <Skeleton className="m-6 h-40" />
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
  return <AppShell team={team.data}>{content}</AppShell>;
}
