import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useAuthStatus, useSignOut } from "@/auth/client";
import {
  InviteOutcomeScreen,
  InviteSignInScreen,
} from "@/components/gate-screens";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTeam, type Team } from "@/lib/team";
import { redeemInvite, type RedeemResult } from "@/server/invites";

export const Route = createFileRoute("/invite/$token")({
  head: () => ({
    meta: [
      { title: "Invite · Cutnotes" },
      // The address is a credential.
      { name: "referrer", content: "no-referrer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InvitePage,
});

const unavailableTitles = {
  used: "This Invite has already been used",
  expired: "This Invite has expired",
  revoked: "This Invite was cancelled",
  unknown: "This Invite link is not valid",
};

function InvitePage() {
  const { token } = Route.useParams();
  const { isLoaded, isSignedIn } = useAuthStatus();
  const team = useTeam();

  if (!isLoaded || !team.data) return <main aria-busy="true"><h1 className="sr-only">Loading</h1><Skeleton className="m-6 h-40" /></main>;
  if (!isSignedIn) {
    return <InviteSignInScreen team={team.data} returnTo={location.href} />;
  }
  return <Redeem team={team.data} token={token} />;
}

function Redeem({ team, token }: { team: Team; token: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const signOut = useSignOut();
  const started = useRef(false);

  const redeem = useMutation({
    mutationFn: () => redeemInvite({ data: { token } }),
    onSuccess: async (result: RedeemResult) => {
      if (result.outcome !== "joined") return;
      queryClient.removeQueries({ queryKey: ["app-shell"] });
      await navigate({ to: "/", replace: true });
    },
  });
  const { mutate } = redeem;

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    mutate();
  }, [mutate]);

  if (redeem.isError) {
    if (redeem.error instanceof Response && redeem.error.status === 401) {
      return <InviteSignInScreen team={team} returnTo={location.href} />;
    }
    return (
      <InviteOutcomeScreen
        team={team}
        title="Something went wrong"
        action={<Button onClick={() => mutate()}>Try again</Button>}
      >
        Your Invite has not been used. Please try again.
      </InviteOutcomeScreen>
    );
  }

  const result = redeem.data;
  if (!result || result.outcome === "joined") {
    return (
      <main className="p-6" aria-busy="true">
        <h1 className="sr-only">
          <span role="status">Joining the Team</span>
        </h1>
        <Skeleton className="h-40" />
      </main>
    );
  }

  if (result.outcome === "already-member") {
    return (
      <InviteOutcomeScreen
        team={team}
        title="You are already on this Team"
        action={
          <Link to="/" className={buttonVariants()}>
            Go to Projects
          </Link>
        }
      >
        This Invite has not been used, so it still works for the person it was
        meant for.
      </InviteOutcomeScreen>
    );
  }

  return (
    <InviteOutcomeScreen
      team={team}
      title={unavailableTitles[result.reason]}
      action={
        <Button variant="outline" onClick={signOut}>
          Sign out
        </Button>
      }
    >
      Please ask an Owner of {team.name} to send you a new one.
    </InviteOutcomeScreen>
  );
}
