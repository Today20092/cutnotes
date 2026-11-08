import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useAuthStatus } from "@/auth/client";
import type { ShellMember } from "@/components/app-shell";
import { NotAMemberScreen, SignInScreen } from "@/components/gate-screens";
import { Skeleton } from "@/components/ui/skeleton";
import { useTeam, type Team } from "@/lib/team";
import { getAppShell } from "@/server/app-shell";

const isRefusal = (error: unknown, status: number) =>
  error instanceof Response && error.status === status;

/** Shows the sign-in or Not a Member screen, and renders children only for an active Member. */
export function MemberGate({
  children,
}: {
  children: (props: { team: Team; member: ShellMember }) => ReactNode;
}) {
  const { isLoaded, isSignedIn } = useAuthStatus();
  const team = useTeam();
  const shell = useQuery({
    queryKey: ["app-shell"],
    queryFn: () => getAppShell(),
    enabled: isLoaded && isSignedIn,
    retry: false,
  });

  if (!isLoaded || !team.data) return <Skeleton className="m-6 h-40" />;
  if (!isSignedIn || isRefusal(shell.error, 401)) {
    return <SignInScreen team={team.data} />;
  }
  if (isRefusal(shell.error, 403)) {
    return <NotAMemberScreen team={team.data} />;
  }
  if (shell.isError) {
    return (
      <p role="alert" className="p-6">
        Something went wrong. Please reload the page.
      </p>
    );
  }
  if (!shell.data) return <Skeleton className="m-6 h-40" />;
  return children({ team: team.data, member: shell.data.member });
}
