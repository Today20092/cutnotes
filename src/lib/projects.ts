import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  completeProject,
  createProject,
  deleteProject,
  getProject,
  listProjects,
  renameProject,
  reopenProject,
} from "@/server/projects";
import { deleteVideo, renameVideo, setVideoStatus } from "@/server/videos";
import type { VideoStatus } from "@/server/db/schema";
import { confirmedProjectWrite, projectsKey, projectWrite, videoWrite } from "@/lib/writes";

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
    projectWrite<ProjectList | ProjectPage, string>(client, {
      mutationFn: (name) => createProject({ data: { name } }),
      apply: (name) =>
        client.setQueryData(
          projectListQuery.queryKey,
          (list) =>
            list && {
              ...list,
              projects: [
                {
                  id: `${PENDING_PREFIX}${crypto.randomUUID()}`,
                  name,
                  createdAt: Date.now(),
                  completedAt: null,
                  deleteAfter: null,
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

/** A write shown at once on every screen holding this Video, undone if it fails. */
function useVideoWrite<Input extends { videoId: string }>(
  videoId: string,
  field: "title" | "status",
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

export const useSetVideoStatus = (videoId: string) =>
  useVideoWrite(
    videoId,
    "status",
    (input: { videoId: string; status: VideoStatus }) => setVideoStatus({ data: input }),
    (video, { status }) => ({ ...video, status }),
  );

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
