import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { Comment } from "@/server/comment-rules";

type WithComments = { comments: Comment[] };

export function replaceComment<Data extends WithComments>(
  client: QueryClient,
  queryKey: QueryKey,
  id: string,
  comment?: Comment,
) {
  client.setQueryData<Data>(
    queryKey,
    (page) =>
      page && {
        ...page,
        comments: [
          ...page.comments.filter((row) => row.id !== id),
          ...(comment ? [comment] : []),
        ].sort((a, b) => a.timecodeMs - b.timecodeMs || a.createdAt - b.createdAt),
      },
  );
}

export async function optimisticComment<Data extends WithComments>(
  client: QueryClient,
  queryKey: QueryKey,
  comment: Comment,
) {
  await client.cancelQueries({ queryKey });
  const previous = client
    .getQueryData<Data>(queryKey)
    ?.comments.find((row) => row.id === comment.id);
  replaceComment<Data>(client, queryKey, comment.id, comment);
  return previous;
}
