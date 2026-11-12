import { Card, CardHeader, CardTitle, CardDescription, CardAction } from "@/components/ui/card";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FolderOpen, Plus, Upload } from "lucide-react";
import { useState } from "react";
import { MemberScreen } from "@/components/member-screen";
import {
  canDelete,
  canWrite,
  unreadFirst,
  PageHeading,
  ProjectNameSheet,
  RenameProjectButton,
  videoGridClass,
  VideoGridSkeleton,
  WriteFeedback,
} from "@/components/project-parts";
import { UploadSheet } from "@/components/upload-parts";
import { VideoTile } from "@/components/video-tile";
import { Badge } from "@/components/ui/badge";
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
  isPendingProject,
  projectListQuery,
  useCreateProject,
  useRenameProject,
  type ProjectList,
} from "@/lib/projects";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Projects · Cutnotes" }] }),
  component: Home,
});

function Home() {
  return (
    <MemberScreen query={projectListQuery} skeleton={<VideoGridSkeleton />}>
      {(list) => <ProjectListView list={list} />}
    </MemberScreen>
  );
}

function ProjectListView({ list }: { list: ProjectList }) {
  const createProject = useCreateProject();
  const renameProject = useRenameProject();
  const [status, setStatus] = useState("");
  const [failure, setFailure] = useState("");
  const writable = canWrite(list.member.role);

  function create(name: string) {
    setFailure("");
    createProject.mutate(name, {
      onSuccess: () => setStatus(`Project ${name} created`),
      onError: () => setFailure(`Could not create ${name}. Nothing was saved. Try again.`),
    });
  }

  function rename(projectId: string, previous: string, name: string) {
    setFailure("");
    renameProject.mutate(
      { projectId, name },
      {
        onSuccess: () => setStatus(`Project renamed to ${name}`),
        onError: () => setFailure(`Could not rename ${previous}. Nothing changed. Try again.`),
      },
    );
  }

  const newProjectSheet = (
    <ProjectNameSheet
      title="New project"
      submitLabel="Create Project"
      onSubmit={create}
      trigger={
        <Button variant="secondary">
          <Plus aria-hidden /> New project
        </Button>
      }
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="Projects">
        {(writable || list.projects.some((project) => canWrite(project.role))) && (
          <>
            {writable && list.projects.length > 0 && newProjectSheet}
            <UploadSheet
              destination={{
                kind: "new",
                projects: list.projects.filter(
                  (project) =>
                    project.completedAt === null &&
                    canWrite(project.role) &&
                    !isPendingProject(project),
                ),
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
        <section aria-labelledby="projects-heading" className="flex flex-col gap-2">
          <h2 id="projects-heading" className="text-lg font-semibold">
            Projects
          </h2>
          <ul className={videoGridClass}>
            {list.projects.map((project) => (
              <li key={project.id} className="min-w-0">
                <Card className="h-full">
                  <CardHeader className="p-4">
                    <CardTitle>
                      <FolderOpen className="mb-3 size-5 text-muted-foreground" aria-hidden />
                      {isPendingProject(project) ? (
                        <span className="min-w-0 font-medium wrap-anywhere">{project.name}</span>
                      ) : (
                        <Link
                          to="/projects/$projectId"
                          params={{ projectId: project.id }}
                          className="inline-flex min-h-11 items-center rounded font-medium wrap-anywhere underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                        >
                          {project.name}
                        </Link>
                      )}
                    </CardTitle>
                    <CardDescription>
                      {list.videos.filter((video) => video.projectId === project.id).length}{" "}
                      {list.videos.filter((video) => video.projectId === project.id).length === 1
                        ? "video"
                        : "videos"}
                    </CardDescription>
                    <CardAction>
                      {project.completedAt !== null ? (
                        <Badge variant="secondary" className="shrink-0">
                          Complete
                        </Badge>
                      ) : (
                        canWrite(project.role) &&
                        !isPendingProject(project) && (
                          <RenameProjectButton
                            name={project.name}
                            onRename={(name) => rename(project.id, project.name, name)}
                          />
                        )
                      )}
                    </CardAction>
                  </CardHeader>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      {list.videos.length > 0 && (
        <section aria-labelledby="videos-heading" className="flex flex-col gap-2">
          <h2 id="videos-heading" className="text-lg font-semibold">
            Recent videos
          </h2>
          <ul className={videoGridClass}>
            {unreadFirst(list.videos).map((video) => (
              <li key={video.id} className="min-w-0">
                <VideoTile
                  video={video}
                  writable={canWrite(video.role)}
                  deletable={canDelete({ ...list.member, role: video.role }, video)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
