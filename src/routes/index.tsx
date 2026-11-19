import * as v from "valibot";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FolderOpen, Plus, Upload } from "lucide-react";
import { useState } from "react";
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
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { projectStages } from "@/lib/project-stage";
import {
  isPendingProject,
  projectListQuery,
  useCreateProject,
  type ProjectList,
} from "@/lib/projects";

// An unknown value is dropped rather than shown as an error page.
const searchSchema = v.object({
  stage: v.fallback(v.optional(v.picklist(projectStages)), undefined),
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
  const navigate = useNavigate();
  const { stage } = Route.useSearch();
  const createProject = useCreateProject();
  const [status, setStatus] = useState("");
  const [failure, setFailure] = useState("");
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
        onSuccess: () => setStatus(`Project ${name} created`),
        onError: () => setFailure(`Could not create ${name}. Nothing was saved. Try again.`),
      },
    );
  }

  const newProjectSheet = (
    <ProjectNameSheet
      title="New project"
      submitLabel="Create Project"
      onSubmit={create}
      trigger={
        <Button>
          <Plus aria-hidden /> New project
        </Button>
      }
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="Projects">
        {(writable || list.projects.some((project) => canUpload(project.role))) && (
          <>
            <UploadSheet
              destination={{ kind: "new", projects: uploadTargets }}
              trigger={
                <Button variant="secondary">
                  <Upload aria-hidden /> Upload
                </Button>
              }
            />
            {writable && list.projects.length > 0 && newProjectSheet}
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
        <StageBoard
          list={list}
          stage={stage}
          onStageChange={(next) =>
            void navigate({ to: "/", search: { stage: next }, replace: true })
          }
        />
      )}
    </div>
  );
}
