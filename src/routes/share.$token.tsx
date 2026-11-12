import { shareMeta, type SharePreview } from "@/lib/share-preview";
import { getSharePreview } from "@/server/sharing";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Review, type CommentActor, type Draft } from "@/components/comments";
import { SiteFeedback } from "@/components/site-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TeamLogo, useTeam } from "@/lib/team";
import { draftComment } from "@/lib/review";
import { optimisticComment, replaceComment } from "@/lib/comment-cache";
import { createGuestComment, getGuestReview } from "@/server/sharing";

export const Route = createFileRoute("/share/$token")({
  ssr: "data-only",
  loader: ({ params }) => getSharePreview({ data: { token: params.token } }),
  head: ({ loaderData }) => ({ meta: shareMeta(loaderData, "Shared video unavailable") }),
  component: GuestPage,
});

type GuestReview = Awaited<ReturnType<typeof getGuestReview>>;

const nameKey = "cutnotes-guest-name";
const storedName = () => {
  try {
    return localStorage.getItem(nameKey) ?? "";
  } catch {
    return "";
  }
};
const isRateLimited = (error: unknown) => error instanceof Response && error.status === 429;
const guestQuery = (token: string) =>
  queryOptions({
    queryKey: ["guest", token],
    queryFn: () => getGuestReview({ data: { token } }),
    retry: false,
    refetchInterval: 30_000,
    refetchOnWindowFocus: "always",
  });

function GuestPage() {
  const { token } = Route.useParams();
  const preview = Route.useLoaderData();
  const [name, setName] = useState(storedName);
  const entered = useRef(false);
  if (!name)
    return (
      <Welcome
        preview={preview}
        onDone={(value) => {
          entered.current = true;
          setName(value);
        }}
      />
    );
  return <GuestReviewScreen token={token} name={name} focusHeading={entered.current} />;
}

function Welcome({
  onDone,
  preview,
}: {
  onDone: (name: string) => void;
  preview: SharePreview | null;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  if (!preview)
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-2 p-6 text-center">
        <h1 className="text-xl font-semibold">This link is unavailable</h1>
        <p>Ask the person who sent it for a new one.</p>
        <SiteFeedback />
      </main>
    );
  function submit() {
    const name = value.trim();
    if (!name) {
      setError(true);
      return;
    }
    try {
      localStorage.setItem(nameKey, name);
    } catch {
      /* the name just lasts for this visit */
    }
    onDone(name);
  }
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6">
      <form
        noValidate
        className="flex w-full max-w-sm flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <h1 className="text-xl font-semibold">{preview?.title ?? "Welcome"}</h1>
        <p className="text-muted-foreground">
          {preview?.description ??
            "This link is unavailable. Ask the person who sent it for a new one."}
          {preview && " Your name appears on the comments you leave."}
        </p>
        <label htmlFor="guest-name" className="text-sm font-medium">
          Your name
        </label>
        <Input
          id="guest-name"
          autoComplete="name"
          maxLength={60}
          value={value}
          aria-invalid={error}
          aria-describedby={error ? "guest-name-error" : undefined}
          onChange={(event) => {
            setValue(event.target.value);
            setError(false);
          }}
        />
        {error && (
          <p id="guest-name-error" role="alert">
            Enter your name.
          </p>
        )}
        <Button type="submit">Continue</Button>
      </form>
      <SiteFeedback />
    </main>
  );
}

function GuestReviewScreen({
  token,
  name,
  focusHeading,
}: {
  token: string;
  name: string;
  focusHeading: boolean;
}) {
  const review = useQuery(guestQuery(token));
  if (review.isPending)
    return (
      <main className="p-4">
        <h1 className="sr-only">Loading shared Video</h1>
        <Skeleton className="h-64" />
      </main>
    );
  if (!review.data)
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-2 p-6 text-center">
        <h1 className="text-xl font-semibold">
          {isRateLimited(review.error) ? "Too many requests" : "This link is unavailable"}
        </h1>
        <p className="text-muted-foreground">
          {isRateLimited(review.error)
            ? "Wait a minute, then reload this page."
            : "Ask the person who sent it for a new one."}
        </p>
        <SiteFeedback error={review.error} />
      </main>
    );
  return (
    <Loaded
      key={review.data.revision.id}
      page={review.data}
      token={token}
      name={name}
      focusHeading={focusHeading}
    />
  );
}

function Loaded({
  page,
  token,
  name,
  focusHeading,
}: {
  page: GuestReview;
  token: string;
  name: string;
  focusHeading: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusHeading) heading.current?.focus();
  }, [focusHeading]); // The Welcome form that held focus is gone.
  const actor = useGuestActor(token, name, page.permission === "comment");
  const team = useTeam().data;
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-4 p-4">
      {team && (
        <p className="flex items-center gap-2 text-sm font-medium wrap-anywhere">
          <TeamLogo team={team} />
          {team.name} wants your feedback
        </p>
      )}
      <a href="#comments" className="sr-only focus:not-sr-only">
        Skip to Comments
      </a>
      <h1 ref={heading} tabIndex={-1} className="text-xl font-semibold wrap-anywhere">
        {page.title}
      </h1>
      <Review
        videoId={page.revision.id}
        revision={page.revision}
        playback={page.playback}
        comments={page.comments}
        renewPlayback={() => getGuestReview({ data: { token } })}
        actor={actor}
      />
      <footer className="mt-4 border-t pt-2">
        <SiteFeedback />
      </footer>
    </main>
  );
}

/** Guest adapter: Guests only send; Resolve, edit and delete stay with Members. */
function useGuestActor(token: string, name: string, writable: boolean): CommentActor {
  const client = useQueryClient();
  const { queryKey } = guestQuery(token);
  const write = useMutation({
    mutationFn: (draft: Draft) => createGuestComment({ data: { ...draft, token, name } }),
    onMutate: (draft) =>
      optimisticComment<GuestReview>(client, queryKey, draftComment(draft, name, true)),
    onError: (_error, draft, previous) =>
      replaceComment<GuestReview>(client, queryKey, draft.id, previous),
    onSettled: () => client.invalidateQueries({ queryKey }),
  });
  return {
    writable,
    closedNote: "This link is view-only.",
    pending: write.isPending,
    send: write.mutateAsync,
    sendFailure: (error) =>
      isRateLimited(error)
        ? "Too many Comments right now. Your text is kept; wait a minute and try again."
        : "Could not send Comment. Your text is kept; try again.",
  };
}
