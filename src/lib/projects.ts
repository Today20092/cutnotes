import {
  queryOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
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

const FOLLOW_PROCESSING_MS = 5000;

/** Keeps a screen current while one of its Revisions is on its way to ready. */
const followProcessing = (query: {
  state: { data?: { videos: { latestRevisionState: string | null }[] } };
}) =>
  query.state.data?.videos.some(
    ({ latestRevisionState: state }) =>
      state === "uploading" || state === "processing",
  )
    ? FOLLOW_PROCESSING_MS
    : false;

export const projectListQuery = queryOptions({
  queryKey: ["projects"],
  queryFn: () => listProjects(),
  retry: false,
  refetchInterval: followProcessing,
});

export const projectQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["projects", projectId],
    queryFn: () => getProject({ data: { projectId } }),
    retry: false,
    refetchInterval: followProcessing,
  });

export type ProjectList = Awaited<ReturnType<typeof listProjects>>;
export type ProjectPage = Awaited<ReturnType<typeof getProject>>;
export type ProjectSummary = ProjectList["projects"][number];
export type VideoSummary = ProjectList["videos"][number];

const PENDING_PREFIX = "pending-";
export const isPendingProject = (project: ProjectSummary) =>
  project.id.startsWith(PENDING_PREFIX);

const mutationKey = ["project-write"];

async function snapshotProjects(client: QueryClient) {
  await client.cancelQueries({ queryKey: projectListQuery.queryKey });
  return client.getQueriesData<ProjectList | ProjectPage>({
    queryKey: projectListQuery.queryKey,
  });
}

type Snapshot = Awaited<ReturnType<typeof snapshotProjects>>;

function restore(client: QueryClient, snapshot: Snapshot | undefined) {
  snapshot?.forEach(([key, data]) => client.setQueryData(key, data));
}

/** Only the last pending write refetches, so an earlier answer cannot undo a later one. */
function refreshAfterLastWrite(client: QueryClient) {
  if (client.isMutating({ mutationKey }) === 1 && !client.isMutating({ mutationKey: ["video-write"] })) {
    return client.invalidateQueries({ queryKey: projectListQuery.queryKey });
  }
}

export function refreshAfterVideoWrite(client: QueryClient, videoId: string) {
  const refreshReview = client.isMutating({ mutationKey: ["video-write", videoId] }) === 1
    ? client.invalidateQueries({ queryKey: ["review", videoId] }) : undefined;
  const refreshProjects = client.isMutating({ mutationKey: ["video-write"] }) === 1 && !client.isMutating({ mutationKey })
    ? client.invalidateQueries({ queryKey: projectListQuery.queryKey }) : undefined;
  return Promise.all([refreshReview, refreshProjects]);
}

export function useCreateProject() {
  const client = useQueryClient();
  return useMutation({
    mutationKey,
    mutationFn: (name: string) => createProject({ data: { name } }),
    onMutate: async (name) => {
      const snapshot = await snapshotProjects(client);
      client.setQueryData(projectListQuery.queryKey, (list) =>
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
      );
      return { snapshot };
    },
    onError: (_error, _name, context) => restore(client, context?.snapshot),
    onSettled: () => refreshAfterLastWrite(client),
  });
}

export function useRenameProject() {
  const client = useQueryClient();
  return useMutation({
    mutationKey,
    mutationFn: (input: { projectId: string; name: string }) =>
      renameProject({ data: input }),
    onMutate: async ({ projectId, name }) => {
      const snapshot = await snapshotProjects(client);
      client.setQueryData(projectListQuery.queryKey, (list) =>
        list && {
          ...list,
          projects: list.projects.map((project) =>
            project.id === projectId ? { ...project, name } : project,
          ),
          videos: list.videos.map((video) =>
            video.projectId === projectId
              ? { ...video, projectName: name }
              : video,
          ),
        },
      );
      client.setQueryData(projectQuery(projectId).queryKey, (page) =>
        page && { ...page, project: { ...page.project, name } },
      );
      return { snapshot };
    },
    onError: (_error, _input, context) => restore(client, context?.snapshot),
    onSettled: () => refreshAfterLastWrite(client),
  });
}

const COUNTDOWN_MS = 14 * 24 * 60 * 60 * 1000;

export function useSetProjectComplete() {
  const client = useQueryClient();
  return useMutation({
    mutationKey,
    mutationFn: ({ projectId, complete }: { projectId: string; complete: boolean }) =>
      complete ? completeProject({ data: { projectId } }) : reopenProject({ data: { projectId } }),
    onMutate: async ({ projectId, complete }) => {
      const snapshot = await snapshotProjects(client);
      const now = Date.now();
      const completedAt = complete ? now : null;
      const deleteAfter = complete ? now + COUNTDOWN_MS : null;
      const apply = (project: ProjectSummary) =>
        project.id === projectId ? { ...project, completedAt, deleteAfter } : project;
      client.setQueriesData<ProjectList | ProjectPage>({ queryKey: projectListQuery.queryKey }, (data) => {
        if (!data) return data;
        const videos = data.videos.map((video) =>
          video.projectId === projectId ? { ...video, projectCompletedAt: completedAt } : video);
        return "projects" in data
          ? { ...data, videos, projects: data.projects.map(apply) }
          : { ...data, videos, project: apply(data.project) };
      });
      return { snapshot };
    },
    onError: (_error, _input, context) => restore(client, context?.snapshot),
    onSettled: () => refreshAfterLastWrite(client),
  });
}

/** A write shown at once on every screen holding this Video, undone if it fails. */
function useVideoWrite<Input extends { videoId: string }>(
  videoId: string,
  field: "title" | "status",
  write: (input: Input) => Promise<unknown>,
  apply: (video: VideoSummary, input: Input) => VideoSummary,
) {
  const client = useQueryClient();
  const videoMutationKey = ["video-write", videoId];
  return useMutation({
    mutationKey: videoMutationKey,
    scope: { id: `video-${videoId}` },
    mutationFn: write,
    onMutate: async (input: Input) => {
      const snapshot = await snapshotProjects(client);
      client.setQueriesData<ProjectList | ProjectPage>(
        { queryKey: projectListQuery.queryKey },
        (data) =>
          data && {
            ...data,
            videos: data.videos.map((video) =>
              video.id === input.videoId ? apply(video, input) : video,
            ),
          },
      );
      return { snapshot, field };
    },
    onError: (_error, _input, context) => {
      if (!context) return;
      // Scopes serialize requests, but queued onMutate callbacks already ran.
      // Rebase their rollback snapshots and restore only this field on this Video.
      const restoreField = (data: ProjectList | ProjectPage | undefined, previous: ProjectList | ProjectPage | undefined) =>
        data && { ...data, videos: data.videos.map((video) => {
          const before = previous?.videos.find((row) => row.id === videoId);
          return video.id === videoId && before ? { ...video, [field]: before[field] } : video;
        }) };
      const mutations = client.getMutationCache().findAll({ mutationKey: videoMutationKey });
      const index = mutations.findIndex((mutation) => mutation.state.context === context);
      let superseded = false;
      for (const mutation of mutations.slice(index + 1)) {
        const later = mutation.state.context as typeof context | undefined;
        if (mutation.state.status !== "pending" || !later?.snapshot) continue;
        if (later.field === field) superseded = true;
        later.snapshot = later.snapshot.map(([key, data]) => [key, restoreField(data, context.snapshot.find(([oldKey]) => JSON.stringify(oldKey) === JSON.stringify(key))?.[1])]);
      }
      if (!superseded) context.snapshot.forEach(([key, previous]) =>
        client.setQueryData<ProjectList | ProjectPage>(key, (data) => restoreField(data, previous)));
    },
    onSettled: () => refreshAfterVideoWrite(client, videoId),
  });
}

export const useRenameVideo = (videoId: string) =>
  useVideoWrite(
    videoId, "title",
    (input: { videoId: string; title: string }) =>
      renameVideo({ data: input }),
    (video, { title }) => ({ ...video, title }),
  );

export const useSetVideoStatus = (videoId: string) =>
  useVideoWrite(
    videoId, "status",
    (input: { videoId: string; status: VideoStatus }) =>
      setVideoStatus({ data: input }),
    (video, { status }) => ({ ...video, status }),
  );

export function useDeleteWork(kind: "Project" | "Video", id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationKey,
    scope: { id: `${kind.toLowerCase()}-${id}` },
    mutationFn: () => kind === "Project"
      ? deleteProject({ data: { projectId: id } })
      : deleteVideo({ data: { videoId: id } }),
    onMutate: () => client.cancelQueries({ queryKey: projectListQuery.queryKey }),
    onSuccess: () => {
      // Wait until the deleted tile and its focus-trapping confirmation have unmounted.
      requestAnimationFrame(() => document.querySelector<HTMLHeadingElement>("h1")?.focus());
      client.setQueriesData<ProjectList | ProjectPage>({ queryKey: projectListQuery.queryKey }, (data) => {
        if (!data) return data;
        const videos = data.videos.filter((video) => kind === "Project" ? video.projectId !== id : video.id !== id);
        return "projects" in data && kind === "Project"
          ? { ...data, videos, projects: data.projects.filter((project) => project.id !== id) }
          : { ...data, videos };
      });
    },
    onSettled: () => refreshAfterLastWrite(client),
  });
}
