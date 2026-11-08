import { createFileRoute, Link } from "@tanstack/react-router";
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
import { projectQuery, useRenameProject, type ProjectPage } from "@/lib/projects";

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
  const renameProject = useRenameProject();
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

  return (
    <div className="flex flex-col gap-4">
      <BackLink />
      <PageHeading title={project.name}>
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
              <VideoTile video={video} writable={writable} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
