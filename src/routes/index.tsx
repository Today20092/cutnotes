import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { MemberScreen } from "@/components/member-screen";
import {
  canWrite,
  PageHeading,
  ProjectNameSheet,
  RenameProjectButton,
  VideoCard,
  videoGridClass,
  VideoGridSkeleton,
  WriteFeedback,
} from "@/components/project-parts";
import { Button } from "@/components/ui/button";
import {
  isPendingProject,
  projectListQuery,
  useCreateProject,
  useRenameProject,
  type ProjectList,
} from "@/lib/projects";

export const Route = createFileRoute("/")({ component: Home });

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
      onError: () =>
        setFailure(`Could not create ${name}. Nothing was saved. Try again.`),
    });
  }

  function rename(projectId: string, previous: string, name: string) {
    setFailure("");
    renameProject.mutate(
      { projectId, name },
      {
        onSuccess: () => setStatus(`Project renamed to ${name}`),
        onError: () =>
          setFailure(`Could not rename ${previous}. Nothing changed. Try again.`),
      },
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="Projects">
        {/* Upload joins New project here with its own ticket. */}
        {writable && (
          <ProjectNameSheet
            title="New project"
            submitLabel="Create Project"
            onSubmit={create}
            trigger={
              <Button variant="outline">
                <Plus aria-hidden /> New project
              </Button>
            }
          />
        )}
      </PageHeading>
      <WriteFeedback status={status} failure={failure} />

      {list.projects.length === 0 ? (
        <p className="text-muted-foreground">
          No Projects yet.{" "}
          {writable
            ? "Use New project to create the first one."
            : "An Owner or Editor will create the first one."}
        </p>
      ) : (
        <section aria-labelledby="projects-heading" className="flex flex-col gap-2">
          <h2 id="projects-heading" className="font-medium">
            All Projects
          </h2>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {list.projects.map((project) => (
              <li
                key={project.id}
                className="flex items-center justify-between gap-2 rounded-md border p-2 pl-3"
              >
                {isPendingProject(project) ? (
                  <span className="min-w-0 font-medium wrap-anywhere">
                    {project.name}
                  </span>
                ) : (
                  <Link
                    to="/projects/$projectId"
                    params={{ projectId: project.id }}
                    className="min-w-0 font-medium wrap-anywhere underline-offset-4 hover:underline"
                  >
                    {project.name}
                  </Link>
                )}
                {project.completedAt !== null ? (
                  <span className="shrink-0 text-xs">Complete</span>
                ) : (
                  writable &&
                  !isPendingProject(project) && (
                    <RenameProjectButton
                      name={project.name}
                      onRename={(name) => rename(project.id, project.name, name)}
                    />
                  )
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {list.videos.length > 0 && (
        <section aria-labelledby="videos-heading" className="flex flex-col gap-2">
          <h2 id="videos-heading" className="font-medium">
            Videos
          </h2>
          <ul className={videoGridClass}>
            {list.videos.map((video) => (
              <li key={video.id} className="min-w-0">
                <Link
                  to="/projects/$projectId"
                  params={{ projectId: video.projectId }}
                  aria-label={`${video.title}, in ${video.projectName}`}
                  className="block"
                >
                  <VideoCard video={video} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
