import * as v from "valibot";
import { ActionMenu, type Action } from "@/components/action-menu";
import { PeopleStrip } from "@/components/people";
import { PeopleSheet } from "@/components/people-sheet";
import { CopyPageLink } from "@/components/copy-page-link";
import { createFileRoute, Link, useLocation, useNavigate } from "@tanstack/react-router";
import { CompleteBanner, CompleteProject } from "@/components/complete-project";
import { DeleteWork } from "@/components/delete-work";
import { ChevronLeft, Clapperboard, Upload } from "lucide-react";
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
import { ReviewBoard } from "@/components/review-board";
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

// An unknown value is dropped rather than shown as an error page.
const searchSchema = v.object({ sheet: v.fallback(v.optional(v.picklist(["people"])), undefined) });

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
  const renameProject = useRenameProject();
  const setComplete = useSetProjectComplete();
  const [status, setStatus] = useState("");
  const [failure, setFailure] = useState("");
  const { project, videos, member } = page;
  const writable = canWrite(project.role);
  const uploadable = canUpload(project.role);
  const search = Route.useSearch();
  // `#people` is the older link form, still sent in Invite history and old messages.
  const hashPeople = useLocation({ select: (location) => location.hash === "people" });
  const peopleOpen = search.sheet === "people" || hashPeople;
  const isOwner = member.role === "owner";
  const isOpen = project.completedAt === null;

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

  const actions: Action[] = [
    ...(writable && isOpen
      ? [
          {
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
            label: "Complete",
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

  const uploadSheet = (
    <UploadSheet
      destination={{
        kind: "new",
        projects: [{ id: project.id, name: project.name }],
      }}
      trigger={
        <Button>
          <Upload aria-hidden /> Upload
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
      <PageHeading title={project.name}>
        <CopyPageLink kind="project" path={`/projects/${project.id}`} />
        {uploadable && isOpen && videos.length > 0 && uploadSheet}
        <ActionMenu label={`More actions for ${project.name}`} actions={actions} />
      </PageHeading>
      <PeopleStrip projectId={project.id} people={project.people} canManage={isOwner} />
      <PeopleSheet
        projectId={project.id}
        name={project.name}
        people={project.people}
        canManage={isOwner}
        open={peopleOpen}
        onOpenChange={(next) =>
          void navigate({
            to: ".",
            search: { sheet: next ? "people" : undefined },
            hash: "",
            replace: true,
          })
        }
      />
      <WriteFeedback status={status} failure={failure} />
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
      {videos.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Clapperboard aria-hidden />
            </EmptyMedia>
            <EmptyTitle>No Videos yet</EmptyTitle>
            <EmptyDescription>
              {uploadable
                ? "Upload the first cut to start the review."
                : "An Owner or Editor will upload the first cut here."}
            </EmptyDescription>
          </EmptyHeader>
          {uploadable && project.completedAt === null && <EmptyContent>{uploadSheet}</EmptyContent>}
        </Empty>
      ) : (
        <ul className={videoGridClass}>
          {unreadFirst(videos).map((video) => (
            <li key={video.id} className="min-w-0">
              <VideoTile
                video={video}
                writable={writable}
                deletable={canDelete({ ...member, role: project.role }, video)}
              />
            </li>
          ))}
        </ul>
      )}
      {writable && project.completedAt === null && videos.length > 0 && (
        <ReviewBoard videos={videos} />
      )}
    </div>
  );
}
