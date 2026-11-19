import { SettingsLayout } from "@/components/settings-layout";
import { createFileRoute, Link } from "@tanstack/react-router";
import { appShellQuery, MemberScreen } from "@/components/member-screen";
import { MembersManager } from "@/components/members-manager";
import { PageBreadcrumb, PageHeading } from "@/components/project-parts";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/members")({
  head: () => ({ meta: [{ title: "Team · Cutnotes" }] }),
  component: MembersPage,
});

function MembersPage() {
  return (
    <MemberScreen query={appShellQuery} skeleton={<Skeleton className="h-40" />}>
      {({ member }) =>
        member.role === "owner" ? (
          <SettingsLayout>
            <PageBreadcrumb
              trail={[
                { label: "Projects", link: <Link to="/" /> },
                { label: "Settings", link: <Link to="/settings" /> },
              ]}
              current="Team"
            />
            <MembersManager />
          </SettingsLayout>
        ) : (
          <SettingsLayout>
            <PageHeading title="Team" />
            <p>Only an Owner can manage the Team.</p>
          </SettingsLayout>
        )
      }
    </MemberScreen>
  );
}
