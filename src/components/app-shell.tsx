import { Link } from "@tanstack/react-router";
import { FolderOpen, LogOut, UserPlus, Users } from "lucide-react";
import type { ReactNode } from "react";
import { useSignOut } from "@/auth/client";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { UploadAnnouncer, UploadList } from "@/components/upload-parts";
import { TeamLogo, type Team } from "@/lib/team";
import type { Role } from "@/server/db/schema";

export type ShellMember = { displayName: string; role: Role };

const destinations = [
  { to: "/", label: "Projects", icon: FolderOpen, ownerOnly: false },
  { to: "/members", label: "Members", icon: Users, ownerOnly: true },
  { to: "/invites", label: "Invites", icon: UserPlus, ownerOnly: true },
] as const;

export function AppShell({
  team,
  member,
  title,
  pageHeading = false,
  children,
}: {
  team: Team;
  /** Unknown while a screen's first read is in flight; Owner destinations wait for it. */
  member?: ShellMember;
  title: (typeof destinations)[number]["label"];
  /** The screen renders its own h1, so the shell does not add a second. */
  pageHeading?: boolean;
  children: ReactNode;
}) {
  const signOut = useSignOut();
  const visible = destinations.filter(
    (destination) => !destination.ownerOnly || member?.role === "owner",
  );
  return (
    <SidebarProvider>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-background focus:p-2">Skip to content</a>
      <Sidebar collapsible="icon" role="navigation" aria-label="Team">
        <SidebarHeader>
          <div className="flex items-center gap-2 p-1 font-semibold">
            <TeamLogo team={team} />
            <span className="group-data-[collapsible=icon]:hidden">
              {team.name}
            </span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarMenu>
              {visible.map(({ to, label, icon: Icon }) => (
                <SidebarMenuItem key={to}>
                  <SidebarMenuButton
                    isActive={label === title}
                    className="aria-[current=page]:underline aria-[current=page]:underline-offset-4"
                    render={<Link to={to} />}
                  >
                    <Icon />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={signOut}>
                <LogOut />
                <span>Sign out</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset id="main-content" tabIndex={-1} className="min-h-dvh">
        <header className="flex h-14 items-center gap-2 border-b px-4">
          <SidebarTrigger className="hidden md:inline-flex" />
          <div className="flex items-center gap-2 font-semibold md:hidden">
            <TeamLogo team={team} />
            <span>{team.name}</span>
          </div>
          {!pageHeading && (
            <h1 className="sr-only font-semibold md:not-sr-only">{title}</h1>
          )}
        </header>
        <div className="flex-1 p-4 pb-20 md:pb-4">
          <UploadList />
          {children}
          <UploadAnnouncer />
        </div>
        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 flex border-t bg-background md:hidden"
        >
          {visible.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs text-muted-foreground aria-[current=page]:font-semibold aria-[current=page]:text-foreground aria-[current=page]:underline aria-[current=page]:underline-offset-4"
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </Link>
          ))}
          <button
            type="button"
            onClick={signOut}
            className="flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs text-muted-foreground"
          >
            <LogOut className="size-5" aria-hidden />
            Sign out
          </button>
        </nav>
      </SidebarInset>
    </SidebarProvider>
  );
}
