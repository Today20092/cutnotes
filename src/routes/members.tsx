import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { MemberGate } from "@/components/member-gate";
import { MembersManager } from "@/components/members-manager";
import { PageBreadcrumb, PageHeading } from "@/components/project-parts";

export const Route = createFileRoute("/members")({
  head: () => ({ meta: [{ title: "Members · Cutnotes" }] }),
  component: MembersPage,
});

function MembersPage() {
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
                current="Members"
              />
              <MembersManager />
            </div>
          ) : (
            <div className="w-full max-w-xl space-y-4">
              <PageHeading title="Members" />
              <p>Only an Owner can manage Members.</p>
            </div>
          )}
        </AppShell>
      )}
    </MemberGate>
  );
}
