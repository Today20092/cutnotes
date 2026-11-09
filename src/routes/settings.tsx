import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, LogOut, UserPlus, Users } from "lucide-react";
import { useSignOut } from "@/auth/client";
import { AppShell } from "@/components/app-shell";
import { MemberGate } from "@/components/member-gate";
import { PageBreadcrumb, PageHeading } from "@/components/project-parts";
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
  return (
    <MemberGate>
      {({ team, member }) => (
        <AppShell team={team}>
          <div className="flex w-full max-w-xl flex-col gap-4">
            <PageBreadcrumb
              trail={[{ label: "Projects", link: <Link to="/" /> }]}
              current="Settings"
            />
            <PageHeading title="Settings" />
            <section aria-labelledby="account-heading" className="flex flex-col gap-2">
              <h2 id="account-heading" className="text-lg font-semibold">
                Your account
              </h2>
              <dl>
                <dt className="text-sm text-muted-foreground">Name</dt>
                <dd className="wrap-anywhere">{member.displayName}</dd>
                <dt className="mt-2 text-sm text-muted-foreground">Role</dt>
                <dd className="capitalize">{member.role}</dd>
              </dl>
            </section>
            {member.role === "owner" && (
              <section aria-labelledby="team-heading" className="flex flex-col gap-2">
                <h2 id="team-heading" className="text-lg font-semibold">
                  Team
                </h2>
                <ul className="divide-y">
                  {teamLinks.map(({ to, label, detail, icon: Icon }) => (
                    <li key={to}>
                      <Link to={to} className="flex min-h-14 items-center gap-3 py-3">
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
          </div>
        </AppShell>
      )}
    </MemberGate>
  );
}
