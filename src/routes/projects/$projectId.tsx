import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CompleteBanner, CompleteProject } from "@/components/complete-project";
import { DeleteWork } from "@/components/delete-work";
import { ChevronLeft, Upload } from "lucide-react";
import { useState } from "react";
import { MemberScreen } from "@/components/member-screen";
import {
  canWrite,
  PageHeading,
  RenameProjectButton,
  videoGridClass,
  VideoGridSkeleton,
  WriteFeedback,
} from "@/components/project-parts";
import { UploadSheet } from "@/components/upload-parts";
import { VideoTile } from "@/components/video-tile";
import { Button } from "@/components/ui/button";
import { projectQuery, useRenameProject, useSetProjectComplete, type ProjectPage } from "@/lib/projects";

export const Route = createFileRoute("/projects/$projectId")({
  // Only on intent: a first page load has no session token yet.
  loader: ({ context, params, preload }) => {
    if (preload) void context.queryClient.prefetchQuery(projectQuery(params.projectId));
  },
  component: Project,
});

function BackLink() {
  return (
    <Link
      to="/"
      className="inline-flex min-h-10 w-fit items-center gap-1 text-sm underline-offset-4 hover:underline"
    >
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
  const writable = canWrite(member.role);

  function rename(name: string) {
    setFailure("");
    const previous = project.name;
    renameProject.mutate(
      { projectId: project.id, name },
      {
        onSuccess: () => setStatus(`Project renamed to ${name}`),
        onError: () =>
          setFailure(`Could not rename ${previous}. Nothing changed. Try again.`),
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
          setFailure(`Could not ${complete ? "Complete" : "reopen"} ${project.name}. Nothing changed. Try again.`),
      },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <BackLink />
      <PageHeading title={project.name}>
        {member.role === "owner" && project.completedAt === null && (
          <CompleteProject name={project.name} onComplete={() => changeComplete(true)} />
        )}
        {member.role === "owner" && <DeleteWork kind="Project" id={project.id} name={project.name} onDeleted={() => { void navigate({ to: "/" }); }} />}
        {writable && project.completedAt === null && (
          <>
            <RenameProjectButton name={project.name} onRename={rename} />
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
          </>
        )}
      </PageHeading>
      <WriteFeedback status={status} failure={failure} />
      {project.deleteAfter !== null && (
        <CompleteBanner
          deleteAfter={project.deleteAfter}
          action={member.role === "owner" && (
            <Button variant="outline" aria-label={`Reopen ${project.name}`} onClick={() => changeComplete(false)}>Reopen</Button>
          )}
        />
      )}
      {videos.length === 0 ? (
        <p className="text-muted-foreground">
          No Videos yet.{" "}
          {writable
            ? "Upload the first cut to start the review."
            : "An Owner or Editor will upload the first cut here."}
        </p>
      ) : (
        <ul className={videoGridClass}>
          {videos.map((video) => (
            <li key={video.id} className="min-w-0">
              <VideoTile video={video} writable={writable} deletable={member.role === "owner" || (member.role === "editor" && video.createdBy === member.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
