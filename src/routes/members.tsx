import * as v from "valibot";
import { idParam, textParam } from "@/lib/search-params";
import { SettingsLayout } from "@/components/settings-layout";
import { createFileRoute, Link } from "@tanstack/react-router";
import { appShellQuery, MemberScreen } from "@/components/member-screen";
import { MembersManager } from "@/components/members-manager";
import { PageBreadcrumb, PageHeading } from "@/components/project-parts";
import { Skeleton } from "@/components/ui/skeleton";

// An unknown value is dropped rather than shown as an error page.
const searchSchema = v.object({ q: textParam, remove: idParam });

export const Route = createFileRoute("/members")({
  validateSearch: (search) => v.parse(searchSchema, search),
  head: () => ({ meta: [{ title: "Team · Cutnotes" }] }),
  component: MembersPage,
});

function MembersPage() {
  const { q, remove } = Route.useSearch();
  const navigate = Route.useNavigate();
  const setSearch = (change: { q?: string; remove?: string }) =>
    void navigate({
      search: (prev) => ({ ...prev, ...change }),
      replace: true,
      resetScroll: false,
    });
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
            <MembersManager
              q={q}
              onQChange={(next) => setSearch({ q: next })}
              removing={remove}
              onRemovingChange={(id) => setSearch({ remove: id })}
            />
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
