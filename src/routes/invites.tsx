import * as v from "valibot";
import { idParam } from "@/lib/search-params";
import { SettingsLayout } from "@/components/settings-layout";
import { createFileRoute, Link } from "@tanstack/react-router";
import { InvitesManager } from "@/components/invites-manager";
import { appShellQuery, MemberScreen } from "@/components/member-screen";
import { PageBreadcrumb, PageHeading } from "@/components/project-parts";
import { Skeleton } from "@/components/ui/skeleton";

// An unknown value is dropped rather than shown as an error page.
const searchSchema = v.object({ project: idParam });

export const Route = createFileRoute("/invites")({
  validateSearch: (search) => v.parse(searchSchema, search),
  head: () => ({ meta: [{ title: "Invites · Cutnotes" }] }),
  component: InvitesPage,
});

function InvitesPage() {
  const { project } = Route.useSearch();
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
            <InvitesManager project={project} />
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
