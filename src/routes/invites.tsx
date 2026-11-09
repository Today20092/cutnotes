import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { InvitesManager } from "@/components/invites-manager";
import { MemberGate } from "@/components/member-gate";
import { PageBreadcrumb, PageHeading } from "@/components/project-parts";

export const Route = createFileRoute("/invites")({
  head: () => ({ meta: [{ title: "Invites · Cutnotes" }] }),
  component: InvitesPage,
});

function InvitesPage() {
  return (
    <MemberGate>
      {({ team, member }) => (
        <AppShell team={team}>
          {member.role === "owner" ? (
            <div className="flex flex-col gap-2">
              <PageBreadcrumb
                trail={[
                  { label: "Projects", link: <Link to="/" /> },
                  { label: "Settings", link: <Link to="/settings" /> },
                ]}
                current="Invites"
              />
              <PageHeading title="Invites" />
              <InvitesManager />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <PageHeading title="Invites" />
              <p>Only an Owner can manage Invites.</p>
            </div>
          )}
        </AppShell>
      )}
    </MemberGate>
  );
}
