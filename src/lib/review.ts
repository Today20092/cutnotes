import { queryOptions, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
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
import { optimisticComment, replaceComment } from "@/lib/comment-cache";
import type { CommentActor, Draft } from "@/components/comments";
import { canWrite } from "@/components/project-parts";

export type ReviewPage = Awaited<ReturnType<typeof getReview>>;
export type { Comment };

/** The optimistic row for a Comment the viewer just sent. */
export const draftComment = (draft: Draft, authorName: string, isGuest: boolean): Comment => ({
  id: draft.id,
  body: draft.body,
  timecodeMs: draft.timecodeMs,
  drawing: draft.drawing,
  authorName,
  authorAvatarUrl: null,
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
  | { action: "delete"; data: CommentTarget; comment: Comment }
  | { action: "resolve"; data: CommentTarget & { resolved: boolean } };

export function useCommentWrite(videoId: string, revisionId?: string) {
  const client = useQueryClient();
  const queryKey = reviewQuery(videoId, undefined, revisionId).queryKey;
  const waiting = useRef(new Map<string, () => void>());
  useEffect(() => {
    const commits = waiting.current;
    return () => commits.forEach((commit) => commit());
  }, []);
  const write = useMutation(
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
        if (write.action === "create") {
          const previous = await optimisticComment<ReviewPage>(client, queryKey, write.comment);
          return { previous };
        }
        await client.cancelQueries({ queryKey });
        const previous =
          client.getQueryData(queryKey)?.comments.find((row) => row.id === write.data.id) ??
          (write.action === "delete" ? write.comment : undefined);
        client.setQueryData(queryKey, (page) => {
          if (!page) return page;
          const comments =
            write.action === "delete"
              ? page.comments.filter((row) => row.id !== write.data.id)
              : page.comments.map((row) =>
                  row.id !== write.data.id
                    ? row
                    : write.action === "edit"
                      ? { ...row, body: write.data.body }
                      : { ...row, resolvedAt: write.data.resolved ? Date.now() : null },
                );
          return { ...page, comments };
        });
        return { previous };
      },
      onError: (_error, write, context) => {
        // Restore only this Comment, preserving optimistic writes to other rows.
        replaceComment<ReviewPage>(client, queryKey, write.data.id, context?.previous);
      },
    }),
  );
  function deleteWithUndo(comment: Comment, data: CommentTarget, failed: () => void) {
    replaceComment<ReviewPage>(client, queryKey, comment.id);
    const commit = () => {
      clearTimeout(timer);
      waiting.current.delete(comment.id);
      write.mutateAsync({ action: "delete", data, comment }).catch(failed);
    };
    const timer = setTimeout(commit, COMMENT_UNDO_MS);
    waiting.current.set(comment.id, commit);
    return () => {
      if (waiting.current.get(comment.id) !== commit) return;
      clearTimeout(timer);
      waiting.current.delete(comment.id);
      replaceComment<ReviewPage>(client, queryKey, comment.id, comment);
    };
  }
  return { ...write, deleteWithUndo };
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
      ? (comment, failed) => write.deleteWithUndo(comment, target(comment.id), failed)
      : undefined,
    mayRemove: (comment) => !!comment.mine || page.member.role === "owner",
  };
}

export const COMMENT_UNDO_MS = 5000;
