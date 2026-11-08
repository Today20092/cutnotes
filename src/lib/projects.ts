import {
  queryOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  createProject,
  getProject,
  listProjects,
  renameProject,
} from "@/server/projects";

export const projectListQuery = queryOptions({
  queryKey: ["projects"],
  queryFn: () => listProjects(),
  retry: false,
});

export const projectQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["projects", projectId],
    queryFn: () => getProject({ data: { projectId } }),
    retry: false,
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
  if (client.isMutating({ mutationKey }) === 1) {
    return client.invalidateQueries({ queryKey: projectListQuery.queryKey });
  }
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
