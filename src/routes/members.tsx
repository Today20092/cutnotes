import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { MemberGate } from "@/components/member-gate";
import { MembersManager } from "@/components/members-manager";
import { PageHeading } from "@/components/project-parts";

export const Route = createFileRoute("/members")({
  head: () => ({ meta: [{ title: "Members · Cutnotes" }] }),
  component: MembersPage,
});

function MembersPage() {
  return (
    <MemberGate>
      {({ team, member }) => (
        <AppShell team={team} member={member} title="Members" pageHeading>
          {member.role === "owner" ? (
            <MembersManager />
          ) : (
            <div className="mx-auto max-w-xl space-y-4">
              <PageHeading title="Members" />
              <p>Only an Owner can manage Members.</p>
            </div>
          )}
        </AppShell>
      )}
    </MemberGate>
  );
}
