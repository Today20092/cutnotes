import type { ReactNode } from "react";
import { SignInForm, useSignOut } from "@/auth/client";
import { SiteFeedback } from "@/components/site-feedback";
import { Button } from "@/components/ui/button";
import { TeamLogo, type Team } from "@/lib/team";

function GateLayout({ team, children }: { team: Team; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-4 text-center">
      <div className="flex items-center gap-2 font-semibold">
        <TeamLogo team={team} />
        <span>{team.name}</span>
      </div>
      {children}
      <SiteFeedback />
    </main>
  );
}

export function SignInScreen({ team }: { team: Team }) {
  return (
    <GateLayout team={team}>
      <h1 className="text-xl font-semibold">Sign in</h1>
      <SignInForm />
    </GateLayout>
  );
}

export function InviteSignInScreen({
  team,
  returnTo,
  description,
}: {
  team: Team;
  returnTo: string;
  description?: string;
}) {
  return (
    <GateLayout team={team}>
      <div className="max-w-sm space-y-2">
        <h1 className="text-xl font-semibold">You have been invited</h1>
        <p className="text-muted-foreground">
          {description ?? `Sign in to join ${team.name}. No password is needed.`}
        </p>
      </div>
      <SignInForm returnTo={returnTo} />
    </GateLayout>
  );
}

/** A result screen for an Invite. Focus moves to its heading so the outcome is announced. */
export function InviteOutcomeScreen({
  team,
  title,
  children,
  action,
}: {
  team: Team;
  title: string;
  children: ReactNode;
  action: ReactNode;
}) {
  return (
    <GateLayout team={team}>
      <div className="max-w-sm space-y-2">
        <h1
          tabIndex={-1}
          ref={(heading) => heading?.focus()}
          className="text-xl font-semibold outline-none"
        >
          {title}
        </h1>
        <p className="text-muted-foreground">{children}</p>
      </div>
      {action}
    </GateLayout>
  );
}

export function NotAMemberScreen({ team }: { team: Team }) {
  const signOut = useSignOut();
  return (
    <GateLayout team={team}>
      <div className="max-w-sm space-y-2">
        <h1 className="text-xl font-semibold">You need an Invite</h1>
        <p className="text-muted-foreground">
          You are signed in, but you are not on this Team yet. Ask an Owner to send you an Invite.
        </p>
      </div>
      <Button variant="secondary" onClick={signOut}>
        Sign out
      </Button>
    </GateLayout>
  );
}
