import { SettingsLayout } from "@/components/settings-layout";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, LogOut, UserPlus, Users } from "lucide-react";
import { useAccountEmail, useSignOut } from "@/auth/client";
import { appShellQuery, MemberScreen } from "@/components/member-screen";
import { PageBreadcrumb, PageHeading } from "@/components/project-parts";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings · Cutnotes" }] }),
  component: SettingsPage,
});

const teamLinks = [
  { to: "/members", label: "Members", detail: "Change Roles or remove people", icon: Users },
  { to: "/invites", label: "Invites", detail: "Invite someone to the Team", icon: UserPlus },
] as const;

function SettingsPage() {
  const signOut = useSignOut();
  const email = useAccountEmail();
  return (
    <MemberScreen query={appShellQuery} skeleton={<Skeleton className="h-40" />}>
      {({ member }) => (
        <SettingsLayout>
          <PageBreadcrumb
            trail={[{ label: "Projects", link: <Link to="/" /> }]}
            current="Settings"
          />
          <PageHeading title="Settings" />
          <section
            aria-labelledby="account-heading"
            className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-6"
          >
            <h2 id="account-heading" className="text-lg font-semibold">
              Your account
            </h2>
            <dl>
              <dt className="text-sm text-muted-foreground">Name</dt>
              <dd className="wrap-anywhere">{member.displayName}</dd>
              {email && (
                <>
                  <dt className="mt-2 text-sm text-muted-foreground">Email</dt>
                  <dd className="wrap-anywhere">{email}</dd>
                </>
              )}
              <dt className="mt-2 text-sm text-muted-foreground">Role</dt>
              <dd className="capitalize">{member.role}</dd>
            </dl>
          </section>
          {member.role === "owner" && (
            <section
              aria-labelledby="team-heading"
              className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-6"
            >
              <h2 id="team-heading" className="text-lg font-semibold">
                Team
              </h2>
              <ul className="divide-y">
                {teamLinks.map(({ to, label, detail, icon: Icon }) => (
                  <li key={to}>
                    <Link
                      to={to}
                      className="flex min-h-14 items-center gap-3 rounded-md px-2 py-3 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <Icon className="size-5 shrink-0" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{label}</span>
                        <span className="block text-sm text-muted-foreground">{detail}</span>
                      </span>
                      <ChevronRight className="size-4 shrink-0" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <Button variant="secondary" className="w-fit" onClick={signOut}>
            <LogOut aria-hidden /> Sign out
          </Button>
        </SettingsLayout>
      )}
    </MemberScreen>
  );
}
