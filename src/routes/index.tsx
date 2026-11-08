import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { MemberGate } from "@/components/member-gate";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <MemberGate>
      {({ team, member }) => (
        <AppShell team={team} member={member} title="Projects">
          <p className="text-muted-foreground">
            Welcome, {member.displayName}. No Projects yet.
          </p>
        </AppShell>
      )}
    </MemberGate>
  );
}
