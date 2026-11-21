import * as v from "valibot";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, FolderOpen, FolderPlus, Plus, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { MemberScreen } from "@/components/member-screen";
import {
  canUpload,
  canWrite,
  PageHeading,
  ProjectNameSheet,
  VideoGridSkeleton,
  WriteFeedback,
} from "@/components/project-parts";
import { StageBoard } from "@/components/stage-board";
import { UploadSheet } from "@/components/upload-parts";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { projectStages } from "@/lib/project-stage";
import { idParam, param, sheetParam } from "@/lib/search-params";
import {
  isPendingProject,
  projectListQuery,
  useCreateProject,
  type ProjectList,
} from "@/lib/projects";

// An unknown value is dropped rather than shown as an error page.
const sheets = ["new-project", "upload", "complete"] as const;
const searchSchema = v.object({
  stage: param(v.picklist(projectStages)),
  view: param(v.picklist(["board", "list"])),
  sheet: sheetParam(sheets),
  /** The Project a Complete sheet is for. */
  project: idParam,
});

export const Route = createFileRoute("/")({
  validateSearch: (search) => v.parse(searchSchema, search),
  head: () => ({ meta: [{ title: "Projects · Cutnotes" }] }),
  component: Home,
});

function Home() {
  return (
    <MemberScreen query={projectListQuery} skeleton={<VideoGridSkeleton />}>
      {(list) => <ProjectBoard list={list} />}
    </MemberScreen>
  );
}

// Recent videos left this screen: each card already shows its Project's latest cut, notes and unread activity.
function ProjectBoard({ list }: { list: ProjectList }) {
  const navigate = Route.useNavigate();
  const { stage, view, sheet, project } = Route.useSearch();
  const setSearch = (change: Partial<typeof Route.types.fullSearchSchema>) =>
    void navigate({
      search: (prev) => ({ ...prev, ...change }),
      replace: true,
      resetScroll: false,
    });
  const createProject = useCreateProject();
  const [failure, setFailure] = useState("");
  const newButton = useRef<HTMLButtonElement>(null);
  // A sheet opened from the New menu returns focus to it, as a sheet trigger would.
  const openSheet = (next: boolean, name: (typeof sheets)[number]) => {
    setSearch({ sheet: next ? name : undefined });
    if (!next) requestAnimationFrame(() => newButton.current?.focus());
  };
  const writable = canWrite(list.member.role);
  const uploadTargets = list.projects.filter(
    (project) =>
      project.completedAt === null && canUpload(project.role) && !isPendingProject(project),
  );

  function create(name: string) {
    setFailure("");
    createProject.mutate(
      { name },
      {
        onSuccess: (created) =>
          void navigate({ to: "/projects/$projectId", params: { projectId: created.id } }),
        onError: () => setFailure(`Could not create ${name}. Nothing was saved. Try again.`),
      },
    );
  }

  const newProjectSheet = (
    <ProjectNameSheet
      title="New Project"
      submitLabel="Create Project"
      onSubmit={create}
      open={sheet === "new-project"}
      onOpenChange={(next) => openSheet(next, "new-project")}
      // With no Projects yet the empty state carries the button; otherwise the New menu opens it.
      trigger={
        list.projects.length === 0 ? (
          <Button>
            <Plus aria-hidden /> New Project
          </Button>
        ) : undefined
      }
    />
  );
  const canCreate = writable || list.projects.some((project) => canUpload(project.role));
  const canCreateProject = writable && list.projects.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        title="Projects"
        // One compact control in the title row: uploading is the common job, a new Project the rarer one.
        menu={
          canCreate && (
            <Menu>
              <MenuTrigger render={<Button ref={newButton} className="rounded-full px-4" />}>
                <Plus aria-hidden /> New <ChevronDown aria-hidden className="opacity-70" />
              </MenuTrigger>
              <MenuPopup align="end">
                <MenuItem className="min-h-11" onSelect={() => setSearch({ sheet: "upload" })}>
                  <Upload aria-hidden /> Upload Video
                </MenuItem>
                {canCreateProject && (
                  <MenuItem
                    className="min-h-11"
                    onSelect={() => setSearch({ sheet: "new-project" })}
                  >
                    <FolderPlus aria-hidden /> New Project
                  </MenuItem>
                )}
              </MenuPopup>
            </Menu>
          )
        }
      />
      {canCreate && (
        <UploadSheet
          open={sheet === "upload"}
          onOpenChange={(next) => openSheet(next, "upload")}
          destination={{ kind: "new", projects: uploadTargets }}
        />
      )}
      {canCreateProject && newProjectSheet}
      <WriteFeedback status="" failure={failure} />

      {list.projects.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderOpen aria-hidden />
            </EmptyMedia>
            <EmptyTitle>No Projects yet</EmptyTitle>
            <EmptyDescription>
              {writable
                ? "Create a Project to start a review."
                : "An Owner or Editor will create the first one."}
            </EmptyDescription>
          </EmptyHeader>
          {writable && <EmptyContent>{newProjectSheet}</EmptyContent>}
        </Empty>
      ) : (
        <StageBoard
          list={list}
          stage={stage}
          onStageChange={(next) => setSearch({ stage: next })}
          view={view}
          onViewChange={(next) => setSearch({ view: next })}
          completing={sheet === "complete" ? project : undefined}
          onCompletingChange={(id) =>
            setSearch({ sheet: id ? "complete" : undefined, project: id })
          }
        />
      )}
    </div>
  );
}
