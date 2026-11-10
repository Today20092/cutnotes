import { createFileRoute, Link } from "@tanstack/react-router";
import { appShellQuery, MemberScreen } from "@/components/member-screen";
import { MembersManager } from "@/components/members-manager";
import { PageBreadcrumb, PageHeading } from "@/components/project-parts";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/members")({
  head: () => ({ meta: [{ title: "Members · Cutnotes" }] }),
  component: MembersPage,
});

function MembersPage() {
  return (
    <MemberScreen query={appShellQuery} skeleton={<Skeleton className="h-40" />}>
      {({ member }) =>
        member.role === "owner" ? (
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
        )
      }
    </MemberScreen>
  );
}
