import type { MutationOptions, QueryClient, QueryKey } from "@tanstack/react-query";

/** Query and mutation keys for optimistic writes; no other module spells them. */
export const projectsKey = ["projects"] as const;
export const reviewKey = (videoId: string) => ["review", videoId] as const;
const projectWrites = ["project-write"];
const videoWrites = (videoId?: string) => (videoId ? ["video-write", videoId] : ["video-write"]);
export const videoScope = (videoId: string) => ({ id: `video-${videoId}` });

export const isWritingVideo = (client: QueryClient, videoId: string) =>
  client.isMutating({ mutationKey: videoWrites(videoId) }) > 0;

type Snapshot<Data> = [QueryKey, Data | undefined][];

async function snapshot<Data>(client: QueryClient) {
  await client.cancelQueries({ queryKey: projectsKey });
  return client.getQueriesData<Data>({ queryKey: projectsKey });
}

/** Only the last pending write refetches, so an earlier answer cannot undo a later one. */
export function refreshAfterProjectWrite(client: QueryClient) {
  if (
    client.isMutating({ mutationKey: projectWrites }) === 1 &&
    !client.isMutating({ mutationKey: videoWrites() })
  ) {
    return client.invalidateQueries({ queryKey: projectsKey });
  }
}

export function refreshAfterVideoWrite(client: QueryClient, videoId: string) {
  const refreshReview =
    client.isMutating({ mutationKey: videoWrites(videoId) }) === 1
      ? client.invalidateQueries({ queryKey: reviewKey(videoId) })
      : undefined;
  const refreshProjects =
    client.isMutating({ mutationKey: videoWrites() }) === 1 &&
    !client.isMutating({ mutationKey: projectWrites })
      ? client.invalidateQueries({ queryKey: projectsKey })
      : undefined;
  return Promise.all([refreshReview, refreshProjects]);
}

/** Refreshes Projects now unless a pending write will refresh them when it settles. */
export function refreshProjects(client: QueryClient) {
  if (
    !client.isMutating({ mutationKey: projectWrites }) &&
    !client.isMutating({ mutationKey: videoWrites() })
  )
    return client.invalidateQueries({ queryKey: projectsKey });
}

/** A Project write shown at once, every Projects cache restored if it fails. */
export function projectWrite<Data, Input>(
  client: QueryClient,
  options: {
    mutationFn: (input: Input) => Promise<unknown>;
    apply: (input: Input) => void;
  },
): MutationOptions<unknown, Error, Input, { snapshot: Snapshot<Data> }> {
  return {
    mutationKey: projectWrites,
    mutationFn: options.mutationFn,
    onMutate: async (input) => {
      const saved = await snapshot<Data>(client);
      options.apply(input);
      return { snapshot: saved };
    },
    onError: (_error, _input, context) =>
      context?.snapshot.forEach(([key, data]) => client.setQueryData(key, data)),
    onSettled: () => refreshAfterProjectWrite(client),
  };
}

/** A Project write applied only once the server confirms it. */
export function confirmedProjectWrite<Input>(
  client: QueryClient,
  options: {
    scope: { id: string };
    mutationFn: (input: Input) => Promise<unknown>;
    onSuccess: () => void;
  },
): MutationOptions<unknown, Error, Input> {
  return {
    mutationKey: projectWrites,
    scope: options.scope,
    mutationFn: options.mutationFn,
    onMutate: () => client.cancelQueries({ queryKey: projectsKey }),
    onSuccess: options.onSuccess,
    onSettled: () => refreshAfterProjectWrite(client),
  };
}

type WithVideos<Video> = { videos: Video[] };

/** A write to one field of a Video, shown at once on every Projects cache, undone if it fails. */
export function videoWrite<
  Video extends { id: string },
  Data extends WithVideos<Video>,
  Field extends keyof Video & string,
  Input extends { videoId: string },
>(
  client: QueryClient,
  options: {
    videoId: string;
    field: Field;
    mutationFn: (input: Input) => Promise<unknown>;
    apply: (video: Video, input: Input) => Video;
  },
): MutationOptions<unknown, Error, Input, { snapshot: Snapshot<Data>; field: Field }> {
  const { videoId, field, apply } = options;
  const mutationKey = videoWrites(videoId);
  return {
    mutationKey,
    scope: videoScope(videoId),
    mutationFn: options.mutationFn,
    onMutate: async (input) => {
      const saved = await snapshot<Data>(client);
      client.setQueriesData<Data>(
        { queryKey: projectsKey },
        (data) =>
          data && {
            ...data,
            videos: data.videos.map((video) =>
              video.id === input.videoId ? apply(video, input) : video,
            ),
          },
      );
      return { snapshot: saved, field };
    },
    onError: (_error, _input, context) => {
      if (!context) return;
      // Scopes serialize requests, but queued onMutate callbacks already ran.
      // Rebase their rollback snapshots and restore only this field on this Video.
      const restoreField = (data: Data | undefined, previous: Data | undefined) =>
        data && {
          ...data,
          videos: data.videos.map((video) => {
            const before = previous?.videos.find((row) => row.id === videoId);
            return video.id === videoId && before ? { ...video, [field]: before[field] } : video;
          }),
        };
      const mutations = client.getMutationCache().findAll({ mutationKey });
      const index = mutations.findIndex((mutation) => mutation.state.context === context);
      let superseded = false;
      for (const mutation of mutations.slice(index + 1)) {
        const later = mutation.state.context as typeof context | undefined;
        if (mutation.state.status !== "pending" || !later?.snapshot) continue;
        if (later.field === field) superseded = true;
        later.snapshot = later.snapshot.map(([key, data]) => [
          key,
          restoreField(
            data,
            context.snapshot.find(
              ([oldKey]) => JSON.stringify(oldKey) === JSON.stringify(key),
            )?.[1],
          ),
        ]);
      }
      if (!superseded)
        context.snapshot.forEach(([key, previous]) =>
          client.setQueryData<Data>(key, (data) => restoreField(data, previous)),
        );
    },
    onSettled: () => refreshAfterVideoWrite(client, videoId),
  };
}

/** A write to one Video's Review, with its own optimistic update; refreshes after the last write. */
export function reviewWrite<Input, Context>(
  client: QueryClient,
  videoId: string,
  options: Pick<
    MutationOptions<unknown, Error, Input, Context>,
    "mutationFn" | "onMutate" | "onError"
  >,
): MutationOptions<unknown, Error, Input, Context> {
  return {
    ...options,
    mutationKey: videoWrites(videoId),
    scope: videoScope(videoId),
    onSettled: () => refreshAfterVideoWrite(client, videoId),
  };
}
