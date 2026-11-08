import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { InvitesManager } from "@/components/invites-manager";
import { MemberGate } from "@/components/member-gate";

export const Route = createFileRoute("/invites")({
  head: () => ({ meta: [{ title: "Invites · Cutnotes" }] }),
  component: InvitesPage,
});

function InvitesPage() {
  return (
    <MemberGate>
      {({ team, member }) => (
        <AppShell team={team} member={member} title="Invites">
          {member.role === "owner" ? (
            <InvitesManager />
          ) : (
            <p>Only an Owner can manage Invites.</p>
          )}
        </AppShell>
      )}
    </MemberGate>
  );
}
