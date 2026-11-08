import { queryOptions, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { createComment, deleteComment, editComment, resolveComment, type CommentTarget, type NewComment } from "@/server/comments";
import { getReview } from "@/server/playback";

export type ReviewPage = Awaited<ReturnType<typeof getReview>>;
export type Comment = ReviewPage["comments"][number];
const writes = (videoId: string) => ["video-write", videoId];

export const reviewQuery = (videoId: string, client?: QueryClient, revisionId?: string) => queryOptions({
  queryKey: ["review", videoId, revisionId ?? "latest"], queryFn: () => getReview({ data: { videoId, revisionId } }), retry: false,
  refetchInterval: () => client?.isMutating({ mutationKey: writes(videoId) }) ? false : 30_000,
  refetchOnWindowFocus: () => client?.isMutating({ mutationKey: writes(videoId) }) ? false : "always",
});

type Write =
  | { action: "create"; data: NewComment; comment: Comment }
  | { action: "edit"; data: CommentTarget & { body: string } }
  | { action: "delete"; data: CommentTarget }
  | { action: "resolve"; data: CommentTarget & { resolved: boolean } };

export function useCommentWrite(videoId: string, revisionId?: string) {
  const client = useQueryClient();
  const queryKey = reviewQuery(videoId, undefined, revisionId).queryKey;
  const mutationKey = writes(videoId);
  return useMutation({
    mutationKey, scope: { id: `video-${videoId}` },
    mutationFn: (write: Write) => {
      switch (write.action) {
        case "create": return createComment({ data: write.data });
        case "edit": return editComment({ data: write.data });
        case "delete": return deleteComment({ data: write.data });
        case "resolve": return resolveComment({ data: write.data });
      }
    },
    onMutate: async (write) => {
      await client.cancelQueries({ queryKey });
      const previous = client.getQueryData(queryKey)?.comments.find((row) => row.id === write.data.id);
      client.setQueryData(queryKey, (page) => {
        if (!page) return page;
        const comments = write.action === "create" ? [...page.comments.filter((row) => row.id !== write.data.id), write.comment]
          : write.action === "delete" ? page.comments.filter((row) => row.id !== write.data.id)
          : page.comments.map((row) => row.id !== write.data.id ? row : write.action === "edit"
            ? { ...row, body: write.data.body }
            : { ...row, resolvedAt: write.data.resolved ? Date.now() : null });
        return { ...page, comments: comments.sort((a, b) => a.timecodeMs - b.timecodeMs || a.createdAt - b.createdAt) };
      });
      return { previous };
    },
    onError: (_error, write, context) => {
      // Restore only this Comment, preserving optimistic writes to other rows.
      client.setQueryData(queryKey, (page) => page && { ...page, comments: [
        ...page.comments.filter((row) => row.id !== write.data.id), ...(context?.previous ? [context.previous] : []),
      ].sort((a, b) => a.timecodeMs - b.timecodeMs || a.createdAt - b.createdAt) });
    },
    onSettled: () => {
      if (client.isMutating({ mutationKey }) === 1) return client.invalidateQueries({ queryKey: ["review", videoId] });
    },
  });
}
