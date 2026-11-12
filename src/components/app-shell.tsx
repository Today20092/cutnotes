import { Link, useLocation } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import type { ReactNode } from "react";
import { SiteFeedback } from "@/components/site-feedback";
import { buttonVariants } from "@/components/ui/button";
import { UploadAnnouncer, UploadList } from "@/components/upload-parts";
import { TeamLogo, type Team } from "@/lib/team";
import type { Role } from "@/server/db/schema";

export type ShellMember = { displayName: string; role: Role };

/** One row that scrolls away: the Team on the home page, the view's breadcrumb elsewhere, Settings and Site feedback always top right. */
export function AppShell({ team, children }: { team: Team; children: ReactNode }) {
  const isHome = useLocation({ select: (location) => location.pathname === "/" });
  return (
    <div className="relative mx-auto min-h-dvh max-w-7xl">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-background focus:p-2"
      >
        Skip to content
      </a>
      <nav aria-label="Main" className="absolute top-4 right-2 z-20 flex gap-1">
        <SiteFeedback look="icon" />
        <Link
          to="/settings"
          aria-label="Settings"
          title="Settings"
          className={buttonVariants({
            variant: "ghost",
            className: "size-11 aria-[current=page]:bg-muted [&_svg]:size-5",
          })}
        >
          <Settings aria-hidden />
        </Link>
      </nav>
      <main id="main-content" tabIndex={-1} className="p-4 outline-none sm:p-6 lg:p-8">
        {isHome && (
          <div className="mb-2 flex min-h-11 items-center gap-2 pr-24 font-semibold">
            <TeamLogo team={team} />
            <span className="wrap-anywhere">{team.name}</span>
          </div>
        )}
        <UploadList />
        {children}
        <UploadAnnouncer />
      </main>
    </div>
  );
}
