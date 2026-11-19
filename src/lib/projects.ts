import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  completeProject,
  createProject,
  deleteProject,
  getProject,
  listProjects,
  renameProject,
  reopenProject,
  setProjectStage,
} from "@/server/projects";
import { approveVideo, deleteVideo, renameVideo, requestChanges } from "@/server/videos";
import type { ProjectStage } from "@/lib/project-stage";
import {
  confirmedProjectWrite,
  projectsKey,
  projectWrite,
  reviewKey,
  videoWrite,
} from "@/lib/writes";

const FOLLOW_PROCESSING_MS = 5000;

/** Keeps a screen current while one of its Revisions is on its way to ready. */
const followProcessing = (query: {
  state: { data?: { videos: { latestRevisionState: string | null }[] } };
}) =>
  query.state.data?.videos.some(
    ({ latestRevisionState: state }) => state === "uploading" || state === "processing",
  )
    ? FOLLOW_PROCESSING_MS
    : false;

export const projectListQuery = queryOptions({
  queryKey: projectsKey,
  queryFn: () => listProjects(),
  retry: false,
  refetchInterval: followProcessing,
});

export const projectQuery = (projectId: string) =>
  queryOptions({
    queryKey: [...projectsKey, projectId],
    queryFn: () => getProject({ data: { projectId } }),
    retry: false,
    refetchInterval: followProcessing,
  });

export type ProjectList = Awaited<ReturnType<typeof listProjects>>;
export type ProjectPage = Awaited<ReturnType<typeof getProject>>;
export type ProjectSummary = ProjectList["projects"][number];
export type VideoSummary = ProjectList["videos"][number];

const PENDING_PREFIX = "pending-";
export const isPendingProject = (project: ProjectSummary) => project.id.startsWith(PENDING_PREFIX);

export function useCreateProject() {
  const client = useQueryClient();
  return useMutation(
    projectWrite<ProjectList | ProjectPage, { name: string }, { id: string }>(client, {
      mutationFn: (input) => createProject({ data: input }),
      apply: ({ name }) =>
        client.setQueryData(
          projectListQuery.queryKey,
          (list) =>
            list && {
              ...list,
              projects: [
                {
                  id: `${PENDING_PREFIX}${crypto.randomUUID()}`,
                  name,
                  role: list.member.role === "owner" ? ("owner" as const) : ("editor" as const),
                  createdAt: Date.now(),
                  completedAt: null,
                  deleteAfter: null,
                  stage: "new" as const,
                  openNotes: 0,
                  latestRevision: null,
                  changesRequested: false,
                  people: [],
                },
                ...list.projects,
              ],
            },
        ),
    }),
  );
}

export function useRenameProject() {
  const client = useQueryClient();
  return useMutation(
    projectWrite<ProjectList | ProjectPage, { projectId: string; name: string }>(client, {
      mutationFn: (input) => renameProject({ data: input }),
      apply: ({ projectId, name }) => {
        client.setQueryData(
          projectListQuery.queryKey,
          (list) =>
            list && {
              ...list,
              projects: list.projects.map((project) =>
                project.id === projectId ? { ...project, name } : project,
              ),
              videos: list.videos.map((video) =>
                video.projectId === projectId ? { ...video, projectName: name } : video,
              ),
            },
        );
        client.setQueryData(
          projectQuery(projectId).queryKey,
          (page) => page && { ...page, project: { ...page.project, name } },
        );
      },
    }),
  );
}

const COUNTDOWN_MS = 14 * 24 * 60 * 60 * 1000;

export function useSetProjectComplete() {
  const client = useQueryClient();
  return useMutation(
    projectWrite<ProjectList | ProjectPage, { projectId: string; complete: boolean }>(client, {
      mutationFn: ({ projectId, complete }) =>
        complete
          ? completeProject({ data: { projectId } })
          : reopenProject({ data: { projectId } }),
      apply: ({ projectId, complete }) => {
        const now = Date.now();
        const completedAt = complete ? now : null;
        const deleteAfter = complete ? now + COUNTDOWN_MS : null;
        const apply = (project: ProjectSummary) =>
          project.id === projectId ? { ...project, completedAt, deleteAfter } : project;
        client.setQueriesData<ProjectList | ProjectPage>(
          { queryKey: projectListQuery.queryKey },
          (data) => {
            if (!data) return data;
            const videos = data.videos.map((video) =>
              video.projectId === projectId ? { ...video, projectCompletedAt: completedAt } : video,
            );
            return "projects" in data
              ? { ...data, videos, projects: data.projects.map(apply) }
              : { ...data, videos, project: apply(data.project) };
          },
        );
      },
    }),
  );
}

/** Shown at once on the board and the Project page, undone if it fails. */
export function useSetProjectStage() {
  const client = useQueryClient();
  return useMutation(
    projectWrite<ProjectList | ProjectPage, { projectId: string; stage: ProjectStage }>(client, {
      mutationFn: (input) => setProjectStage({ data: input }),
      apply: ({ projectId, stage }) =>
        client.setQueriesData<ProjectList | ProjectPage>(
          { queryKey: projectListQuery.queryKey },
          (data) =>
            data &&
            ("projects" in data
              ? {
                  ...data,
                  projects: data.projects.map((project) =>
                    project.id === projectId ? { ...project, stage } : project,
                  ),
                }
              : data.project.id === projectId
                ? { ...data, project: { ...data.project, stage } }
                : data),
        ),
    }),
  );
}

/** A write shown at once on every screen holding this Video, undone if it fails. */
function useVideoWrite<Input extends { videoId: string }>(
  videoId: string,
  field: "title",
  mutationFn: (input: Input) => Promise<unknown>,
  apply: (video: VideoSummary, input: Input) => VideoSummary,
) {
  const client = useQueryClient();
  return useMutation(
    videoWrite<VideoSummary, ProjectList | ProjectPage, typeof field, Input>(client, {
      videoId,
      field,
      mutationFn,
      apply,
    }),
  );
}

export const useRenameVideo = (videoId: string) =>
  useVideoWrite(
    videoId,
    "title",
    (input: { videoId: string; title: string }) => renameVideo({ data: input }),
    (video, { title }) => ({ ...video, title }),
  );

/**
 * A review decision on the Revision shown on the Video page: it changes the Video's Status and
 * may move its Project. The server refuses it once a newer cut is ready.
 */
export function useReviewDecision(videoId: string, revisionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (decision: "requestChanges" | "approve") =>
      (decision === "approve" ? approveVideo : requestChanges)({ data: { videoId, revisionId } }),
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: reviewKey(videoId) }),
        client.invalidateQueries({ queryKey: projectsKey }),
      ]),
  });
}

export function useDeleteWork(kind: "Project" | "Video", id: string) {
  const client = useQueryClient();
  return useMutation(
    confirmedProjectWrite<void>(client, {
      scope: { id: `${kind.toLowerCase()}-${id}` },
      mutationFn: () =>
        kind === "Project"
          ? deleteProject({ data: { projectId: id } })
          : deleteVideo({ data: { videoId: id } }),
      onSuccess: () => {
        // Wait until the deleted tile and its focus-trapping confirmation have unmounted.
        requestAnimationFrame(() => document.querySelector<HTMLHeadingElement>("h1")?.focus());
        client.setQueriesData<ProjectList | ProjectPage>(
          { queryKey: projectListQuery.queryKey },
          (data) => {
            if (!data) return data;
            const videos = data.videos.filter((video) =>
              kind === "Project" ? video.projectId !== id : video.id !== id,
            );
            return "projects" in data && kind === "Project"
              ? { ...data, videos, projects: data.projects.filter((project) => project.id !== id) }
              : { ...data, videos };
          },
        );
      },
    }),
  );
}
