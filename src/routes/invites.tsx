import { SettingsLayout } from "@/components/settings-layout";
import { createFileRoute, Link } from "@tanstack/react-router";
import { InvitesManager } from "@/components/invites-manager";
import { appShellQuery, MemberScreen } from "@/components/member-screen";
import { PageBreadcrumb, PageHeading } from "@/components/project-parts";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/invites")({
  head: () => ({ meta: [{ title: "Invites · Cutnotes" }] }),
  component: InvitesPage,
});

function InvitesPage() {
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
              current="Invites"
            />
            <PageHeading title="Invites" />
            <InvitesManager />
          </SettingsLayout>
        ) : (
          <SettingsLayout>
            <PageHeading title="Invites" />
            <p>Only an Owner can manage Invites.</p>
          </SettingsLayout>
        )
      }
    </MemberScreen>
  );
}
