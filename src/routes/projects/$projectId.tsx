import * as v from "valibot";
import { idParam, sheetParam } from "@/lib/search-params";
import { ActionMenu, type Action } from "@/components/action-menu";
import { PeopleStrip } from "@/components/people";
import { PeopleSheet } from "@/components/people-sheet";
import { CopyPageLink } from "@/components/copy-page-link";
import { createFileRoute, Link, useLocation, useNavigate } from "@tanstack/react-router";
import { CompleteBanner, CompleteProject } from "@/components/complete-project";
import { DeleteWork } from "@/components/delete-work";
import { ChevronDown, ChevronLeft, Clapperboard, Upload, Users } from "lucide-react";
import { useState } from "react";
import { MemberScreen } from "@/components/member-screen";
import {
  backLinkClass,
  canDelete,
  canUpload,
  canWrite,
  unreadFirst,
  PageBreadcrumb,
  PageHeading,
  ProjectNameSheet,
  videoGridClass,
  VideoGridSkeleton,
  WriteFeedback,
} from "@/components/project-parts";
import { UploadSheet } from "@/components/upload-parts";
import { VideoTile } from "@/components/video-tile";
import { StageBadge } from "@/components/stage-badge";
import { dismissStageUndo, useProjectStageMoves } from "@/components/project-stage-moves";
import { stageLabels } from "@/lib/project-stage";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  projectQuery,
  useRenameProject,
  useSetProjectComplete,
  type ProjectPage,
} from "@/lib/projects";

const sheets = [
  "people",
  "upload",
  "rename",
  "complete",
  "delete",
  "rename-video",
  "delete-video",
  "retry-video",
  "upload-revision",
] as const;

// An unknown value is dropped rather than shown as an error page.
const searchSchema = v.object({ sheet: sheetParam(sheets), video: idParam });

export const Route = createFileRoute("/projects/$projectId")({
  validateSearch: (search) => v.parse(searchSchema, search),
  head: () => ({ meta: [{ title: "Project · Cutnotes" }] }),
  // Only on intent: a first page load has no session token yet.
  loader: ({ context, params, preload }) => {
    if (preload) void context.queryClient.prefetchQuery(projectQuery(params.projectId));
  },
  component: Project,
});

function BackLink() {
  return (
    <Link to="/" className={backLinkClass}>
      <ChevronLeft className="size-4" aria-hidden /> Back to Projects
    </Link>
  );
}

function Project() {
  const { projectId } = Route.useParams();
  return (
    <MemberScreen
      query={projectQuery(projectId)}
      skeleton={<VideoGridSkeleton />}
      notFound={
        <div className="flex flex-col gap-2">
          <BackLink />
          <PageHeading title="Project not found" />
          <p className="text-muted-foreground">
            It may have been deleted. Go back to see the Projects you can open.
          </p>
        </div>
      }
    >
      {(page) => <ProjectView page={page} />}
    </MemberScreen>
  );
}

function ProjectView({ page }: { page: ProjectPage }) {
  const navigate = useNavigate();
  const goTo = Route.useNavigate();
  const renameProject = useRenameProject();
  const setComplete = useSetProjectComplete();
  const { stageActions, feedback } = useProjectStageMoves();
  const [status, setStatus] = useState("");
  const [failure, setFailure] = useState("");
  const { project, videos, member } = page;
  const writable = canWrite(project.role);
  const uploadable = canUpload(project.role);
  const search = Route.useSearch();
  // `#people` is the older link form, still sent in Invite history and old messages.
  const hashPeople = useLocation({ select: (location) => location.hash === "people" });
  const peopleOpen = search.sheet === "people" || hashPeople;
  // One sheet at a time, named in the URL; `video` says which Video a Video sheet is for.
  const setSheet = (sheet?: (typeof sheets)[number], video?: string) =>
    void goTo({ search: (prev) => ({ ...prev, sheet, video }), hash: "", replace: true });
  const isOwner = member.role === "owner";
  const isOpen = project.completedAt === null;
  // An Owner usually hands the first upload to the Project's editor.
  const needsPeople = isOwner && project.people.length === 0;

  function rename(name: string) {
    setFailure("");
    const previous = project.name;
    renameProject.mutate(
      { projectId: project.id, name },
      {
        onSuccess: () => setStatus(`Project renamed to ${name}`),
        onError: () => setFailure(`Could not rename ${previous}. Nothing changed. Try again.`),
      },
    );
  }

  function changeComplete(complete: boolean) {
    dismissStageUndo(project.id);
    setFailure("");
    setStatus("");
    setComplete.mutate(
      { projectId: project.id, complete },
      {
        onSuccess: () => {
          setStatus(complete ? `${project.name} is Complete` : `${project.name} is reopened`);
          // The button that was used has gone, so keep focus on the screen.
          requestAnimationFrame(() => document.querySelector<HTMLHeadingElement>("h1")?.focus());
        },
        onError: () =>
          setFailure(
            `Could not ${complete ? "Complete" : "reopen"} ${project.name}. Nothing changed. Try again.`,
          ),
      },
    );
  }

  const actions: Action<(typeof sheets)[number]>[] = [
    ...(writable && isOpen
      ? [
          {
            id: "rename" as const,
            label: "Rename",
            sheet: (onClosed: () => void) => (
              <ProjectNameSheet
                title="Rename Project"
                submitLabel="Save name"
                initialName={project.name}
                onSubmit={rename}
                startOpen
                onClosed={onClosed}
              />
            ),
          },
        ]
      : []),
    ...(isOwner && isOpen
      ? [
          {
            id: "complete" as const,
            label: "Complete… (deleted in 14 days)",
            sheet: (onClosed: () => void) => (
              <CompleteProject
                name={project.name}
                onComplete={() => changeComplete(true)}
                startOpen
                onClosed={onClosed}
              />
            ),
          },
        ]
      : []),
    ...(isOwner
      ? [
          {
            id: "delete" as const,
            label: "Delete",
            destructive: true,
            sheet: (onClosed: () => void) => (
              <DeleteWork
                kind="Project"
                id={project.id}
                name={project.name}
                startOpen
                onClosed={onClosed}
                onDeleted={() => void navigate({ to: "/" })}
              />
            ),
          },
        ]
      : []),
  ];

  const uploadSheet = (label: string, variant?: "secondary") => (
    <UploadSheet
      open={search.sheet === "upload"}
      onOpenChange={(next) => setSheet(next ? "upload" : undefined)}
      destination={{
        kind: "new",
        projects: [{ id: project.id, name: project.name }],
      }}
      trigger={
        <Button variant={variant}>
          <Upload aria-hidden /> {label}
        </Button>
      }
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <PageBreadcrumb
        trail={[{ label: "Projects", link: <Link to="/" /> }]}
        current={project.name}
      />
      <PageHeading
        title={project.name}
        badge={
          writable && isOpen ? (
            <ActionMenu
              label={`Stage: ${stageLabels[project.stage]}`}
              actions={stageActions(project)}
              triggerContent={
                <>
                  <StageBadge stage={project.stage} />
                  <ChevronDown aria-hidden />
                </>
              }
            />
          ) : (
            <StageBadge stage={project.stage} />
          )
        }
        menu={
          <ActionMenu
            label={`More actions for ${project.name}`}
            actions={actions}
            current={search.sheet}
            onCurrentChange={setSheet}
          />
        }
      >
        {uploadable && isOpen && videos.length > 0 && uploadSheet("New Video")}
        <CopyPageLink kind="project" path={`/projects/${project.id}`} />
      </PageHeading>
      <PeopleStrip projectId={project.id} people={project.people} canManage={isOwner} />
      <PeopleSheet
        projectId={project.id}
        name={project.name}
        people={project.people}
        canManage={isOwner}
        open={peopleOpen}
        onOpenChange={(next) => setSheet(next ? "people" : undefined)}
      />
      <WriteFeedback status={status} failure={failure} />
      {feedback}
      {project.deleteAfter !== null && (
        <CompleteBanner
          deleteAfter={project.deleteAfter}
          action={
            member.role === "owner" && (
              <Button
                variant="secondary"
                aria-label={`Reopen ${project.name}`}
                onClick={() => changeComplete(false)}
              >
                Reopen
              </Button>
            )
          }
        />
      )}
      <section aria-labelledby="videos-heading" className="flex flex-col gap-4">
        <h2 id="videos-heading" className="text-section">
          Videos
        </h2>
        {videos.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Clapperboard aria-hidden />
              </EmptyMedia>
              <EmptyTitle>No Videos yet</EmptyTitle>
              <EmptyDescription>
                {needsPeople
                  ? "Add your editor so they can upload the first cut."
                  : uploadable
                    ? "Upload the first cut to start the review."
                    : "Someone with upload access will add it here."}
              </EmptyDescription>
            </EmptyHeader>
            {uploadable && isOpen && (
              <EmptyContent className="flex-row flex-wrap justify-center">
                {needsPeople && (
                  <Button onClick={() => setSheet("people")}>
                    <Users aria-hidden /> Add people
                  </Button>
                )}
                {uploadSheet("Upload first cut", needsPeople ? "secondary" : undefined)}
              </EmptyContent>
            )}
          </Empty>
        ) : (
          <ul className={videoGridClass}>
            {unreadFirst(videos).map((video) => (
              <li key={video.id} className="min-w-0">
                <VideoTile
                  video={video}
                  writable={writable}
                  uploadable={writable || (uploadable && video.createdBy === member.id)}
                  deletable={canDelete({ ...member, role: project.role }, video)}
                  sheet={search.video === video.id ? search.sheet : undefined}
                  onSheetChange={(sheet) => setSheet(sheet, sheet ? video.id : undefined)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
