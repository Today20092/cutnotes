import { queryOptions, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  createComment,
  deleteComment,
  editComment,
  resolveComment,
  type CommentTarget,
  type NewComment,
} from "@/server/comments";
import type { Comment } from "@/server/comment-rules";
import { getReview } from "@/server/playback";
import { isWritingVideo, reviewKey, reviewWrite } from "@/lib/writes";
import type { CommentActor, Draft } from "@/components/comments";
import { canWrite } from "@/components/project-parts";

export type ReviewPage = Awaited<ReturnType<typeof getReview>>;
export type { Comment };

export const sortComments = (rows: Comment[]) =>
  rows.sort((a, b) => a.timecodeMs - b.timecodeMs || a.createdAt - b.createdAt);

/** The optimistic row for a Comment the viewer just sent. */
export const draftComment = (draft: Draft, authorName: string, isGuest: boolean): Comment => ({
  id: draft.id,
  body: draft.body,
  timecodeMs: draft.timecodeMs,
  drawing: draft.drawing,
  authorName,
  isGuest,
  resolvedAt: null,
  createdAt: Date.now(),
  ...(!isGuest && { mine: true }),
});

export const reviewQuery = (videoId: string, client?: QueryClient, revisionId?: string) =>
  queryOptions({
    queryKey: [...reviewKey(videoId), revisionId ?? "latest"],
    queryFn: () => getReview({ data: revisionId ? { videoId, revisionId } : { videoId } }),
    retry: false,
    refetchInterval: () => (client && isWritingVideo(client, videoId) ? false : 30_000),
    refetchOnWindowFocus: () => (client && isWritingVideo(client, videoId) ? false : "always"),
  });

type Write =
  | { action: "create"; data: NewComment; comment: Comment }
  | { action: "edit"; data: CommentTarget & { body: string } }
  | { action: "delete"; data: CommentTarget }
  | { action: "resolve"; data: CommentTarget & { resolved: boolean } };

export function useCommentWrite(videoId: string, revisionId?: string) {
  const client = useQueryClient();
  const queryKey = reviewQuery(videoId, undefined, revisionId).queryKey;
  return useMutation(
    reviewWrite(client, videoId, {
      mutationFn: (write: Write) => {
        switch (write.action) {
          case "create":
            return createComment({ data: write.data });
          case "edit":
            return editComment({ data: write.data });
          case "delete":
            return deleteComment({ data: write.data });
          case "resolve":
            return resolveComment({ data: write.data });
        }
      },
      onMutate: async (write) => {
        await client.cancelQueries({ queryKey });
        const previous = client
          .getQueryData(queryKey)
          ?.comments.find((row) => row.id === write.data.id);
        client.setQueryData(queryKey, (page) => {
          if (!page) return page;
          const comments =
            write.action === "create"
              ? [...page.comments.filter((row) => row.id !== write.data.id), write.comment]
              : write.action === "delete"
                ? page.comments.filter((row) => row.id !== write.data.id)
                : page.comments.map((row) =>
                    row.id !== write.data.id
                      ? row
                      : write.action === "edit"
                        ? { ...row, body: write.data.body }
                        : { ...row, resolvedAt: write.data.resolved ? Date.now() : null },
                  );
          return { ...page, comments: sortComments(comments) };
        });
        return { previous };
      },
      onError: (_error, write, context) => {
        // Restore only this Comment, preserving optimistic writes to other rows.
        client.setQueryData(
          queryKey,
          (page) =>
            page && {
              ...page,
              comments: sortComments([
                ...page.comments.filter((row) => row.id !== write.data.id),
                ...(context?.previous ? [context.previous] : []),
              ]),
            },
        );
      },
    }),
  );
}

/** Member adapter for the shared review panel. */
export function useMemberActor(
  page: ReviewPage,
  videoId: string,
  cacheRevisionId?: string,
): CommentActor {
  const write = useCommentWrite(videoId, cacheRevisionId);
  const target = (id: string) => ({ id, videoId, revisionId: page.revision!.id });
  const open = page.video?.completedAt === null;
  return {
    writable: open,
    closedNote: "This Project is Complete. Comments are read-only.",
    pending: write.isPending,
    send: (draft) =>
      write.mutateAsync({
        action: "create",
        data: { ...target(draft.id), ...draft },
        comment: draftComment(draft, page.member.displayName, false),
      }),
    resolve:
      open && canWrite(page.member.role)
        ? (comment, resolved) =>
            write.mutateAsync({ action: "resolve", data: { ...target(comment.id), resolved } })
        : undefined,
    edit: open
      ? (comment, body) =>
          write.mutateAsync({ action: "edit", data: { ...target(comment.id), body } })
      : undefined,
    remove: open
      ? (comment) => write.mutateAsync({ action: "delete", data: target(comment.id) })
      : undefined,
    mayRemove: (comment) => !!comment.mine || page.member.role === "owner",
  };
}
