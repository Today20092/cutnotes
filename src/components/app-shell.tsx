import { FolderOpen, LogOut } from "lucide-react";
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
import { TeamLogo, type Team } from "@/lib/team";

export function AppShell({
  team,
  member,
}: {
  team: Team;
  member: { displayName: string };
}) {
  const signOut = useSignOut();
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
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
              <SidebarMenuItem>
                <SidebarMenuButton isActive>
                  <FolderOpen />
                  <span>Projects</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
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
      <SidebarInset className="min-h-dvh">
        <header className="flex h-14 items-center gap-2 border-b px-4">
          <SidebarTrigger className="hidden md:inline-flex" />
          <div className="flex items-center gap-2 font-semibold md:hidden">
            <TeamLogo team={team} />
            <span>{team.name}</span>
          </div>
          <h1 className="hidden font-semibold md:block">Projects</h1>
        </header>
        <main className="flex-1 p-4 pb-20 md:pb-4">
          <p className="text-muted-foreground">
            Welcome, {member.displayName}. No Projects yet.
          </p>
        </main>
        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 grid grid-cols-2 border-t bg-background md:hidden"
        >
          <button
            type="button"
            aria-current="page"
            className="flex h-14 flex-col items-center justify-center gap-0.5 text-xs text-foreground"
          >
            <FolderOpen className="size-5" aria-hidden />
            Projects
          </button>
          <button
            type="button"
            onClick={signOut}
            className="flex h-14 flex-col items-center justify-center gap-0.5 text-xs text-muted-foreground"
          >
            <LogOut className="size-5" aria-hidden />
            Sign out
          </button>
        </nav>
      </SidebarInset>
    </SidebarProvider>
  );
}
