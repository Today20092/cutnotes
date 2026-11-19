import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { createFolder, deleteFolder, getFolder, renameFolder } from "@/server/folders";
import { createProject, moveProject } from "@/server/projects";
import { projectsKey } from "@/lib/writes";

export const foldersKey = ["folders"] as const;

export const folderQuery = (folderId: string) =>
  queryOptions({
    queryKey: [...foldersKey, folderId],
    queryFn: () => getFolder({ data: { folderId } }),
    retry: false,
  });

export type FolderPage = Awaited<ReturnType<typeof getFolder>>;

/** Folder writes are not optimistic: each waits for the server, then refreshes every list. */
function useFolderWrite<Input, Result>(mutationFn: (input: Input) => Promise<Result>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: foldersKey }),
        client.invalidateQueries({ queryKey: projectsKey }),
      ]),
  });
}

export const useCreateFolder = () =>
  useFolderWrite((name: string) => createFolder({ data: { name } }));

export const useRenameFolder = () =>
  useFolderWrite((input: { folderId: string; name: string }) => renameFolder({ data: input }));

export const useDeleteFolder = () =>
  useFolderWrite((folderId: string) => deleteFolder({ data: { folderId } }));

export const useMoveProject = () =>
  useFolderWrite((input: { projectId: string; folderId: string | null }) =>
    moveProject({ data: input }),
  );

/** Creates a Project inside a Folder (the home page creates unfiled ones with `useCreateProject`). */
export const useCreateProjectInFolder = () =>
  useFolderWrite((input: { name: string; folderId: string }) => createProject({ data: input }));
