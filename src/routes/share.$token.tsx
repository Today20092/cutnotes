import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState, type ReactNode } from "react";
import { CommentMarkers, timeLabel } from "@/components/comments";
import { useDrawingControls } from "@/components/drawing-controls";
import { VideoPlayer } from "@/components/player/video-player";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { Shape } from "@/lib/drawing";
import { createGuestComment, getGuestReview } from "@/server/sharing";

export const Route = createFileRoute("/share/$token")({
  head: () => ({
    meta: [
      { title: "Shared Video · Cutnotes" },
      // The address is a credential.
      { name: "referrer", content: "no-referrer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GuestPage,
});

type GuestReview = Awaited<ReturnType<typeof getGuestReview>>;
type GuestComment = GuestReview["comments"][number];

const nameKey = "cutnotes-guest-name";
const storedName = () => { try { return localStorage.getItem(nameKey) ?? ""; } catch { return ""; } };
const isRateLimited = (error: unknown) => error instanceof Response && error.status === 429;
const guestQuery = (token: string) => queryOptions({
  queryKey: ["guest", token], queryFn: () => getGuestReview({ data: { token } }), retry: false,
  refetchInterval: 30_000, refetchOnWindowFocus: "always",
});

function GuestPage() {
  const { token } = Route.useParams();
  const [name, setName] = useState(storedName);
  if (!name) return <Welcome onDone={setName} />;
  return <GuestReviewScreen token={token} name={name} />;
}

function Welcome({ onDone }: { onDone: (name: string) => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  function submit() {
    const name = value.trim();
    if (!name) { setError(true); return; }
    try { localStorage.setItem(nameKey, name); } catch { /* the name just lasts for this visit */ }
    onDone(name);
  }
  return <main className="flex min-h-dvh items-center justify-center p-6">
    <form noValidate className="flex w-full max-w-sm flex-col gap-3" onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <h1 className="text-xl font-semibold">Welcome</h1>
      <p className="text-muted-foreground">No account needed. Type your name to start reviewing.</p>
      <label htmlFor="guest-name" className="text-sm font-medium">Your name</label>
      <Input id="guest-name" autoComplete="name" maxLength={60} value={value} aria-invalid={error} aria-describedby={error ? "guest-name-error" : undefined}
        onChange={(event) => { setValue(event.target.value); setError(false); }} />
      {error && <p id="guest-name-error" role="alert">Enter your name.</p>}
      <Button type="submit">Continue</Button>
    </form>
  </main>;
}

function GuestReviewScreen({ token, name }: { token: string; name: string }) {
  const review = useQuery(guestQuery(token));
  if (review.isPending) return <main className="p-4"><h1 className="sr-only">Loading shared Video</h1><Skeleton className="h-64" /></main>;
  if (!review.data) return <main className="flex min-h-dvh flex-col items-center justify-center gap-2 p-6 text-center">
    <h1 className="text-xl font-semibold">{isRateLimited(review.error) ? "Too many requests" : "This link is unavailable"}</h1>
    <p className="text-muted-foreground">{isRateLimited(review.error) ? "Wait a minute, then reload this page." : "Ask the person who sent it for a new one."}</p>
  </main>;
  return <Loaded key={review.data.revision.id} page={review.data} token={token} name={name} />;
}

function Loaded({ page, token, name }: { page: GuestReview; token: string; name: string }) {
  const [seek, setSeek] = useState<{ timeMs: number }>();
  const [timeMs, setTimeMs] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const pen = useDrawingControls({ timeMs, seek: (ms) => setSeek({ timeMs: ms }), deselect: () => setSelectedId(null) });
  function select(comment: GuestComment) { setSeek({ timeMs: comment.timecodeMs }); setSelectedId(comment.id); setTimeMs(comment.timecodeMs); pen.stop(); }
  return <main className="mx-auto flex max-w-6xl flex-col gap-4 p-4">
    <h1 className="text-xl font-semibold wrap-anywhere">{page.title}</h1>
    <div className="review-layout">
      <div className="review-player" onTimeUpdate={(event) => {
        if (event.target instanceof HTMLVideoElement) setTimeMs(Math.round(event.target.currentTime * 1000));
      }}>
        <VideoPlayer videoId={page.revision.id} revisionId={page.revision.id} frameRate={page.revision.frameRate} playback={page.playback} seek={seek}
          drawing={pen.overlay(selectedId === null ? undefined : { drawing: page.comments.find((c) => c.id === selectedId)?.drawing ?? null })}
          renewPlayback={() => getGuestReview({ data: { token } })}
          timelineMarkers={<CommentMarkers comments={page.comments} durationMs={page.revision.durationMs} selectedId={selectedId} select={select} />} />
      </div>
      <GuestComments page={page} token={token} name={name} timeMs={pen.time} select={select} selectedId={selectedId} drawing={pen.drawing} sent={pen.reset} drawingControls={page.permission === "comment" && pen.controls} />
    </div>
  </main>;
}

function GuestComments({ page, token, name, timeMs, select, selectedId, drawing, sent, drawingControls }: {
  drawing: Shape[]; sent: () => void; drawingControls: ReactNode;
  page: GuestReview; token: string; name: string; timeMs: number; select: (comment: GuestComment) => void; selectedId: string | null;
}) {
  const client = useQueryClient();
  const { queryKey } = guestQuery(token);
  const [resolved, setResolved] = useState(false);
  const [body, setBody] = useState("");
  const [failure, setFailure] = useState("");
  const draft = useRef<{ id: string; body: string; timecodeMs: number; drawing: Shape[] | null } | null>(null);
  const write = useMutation({
    mutationFn: (data: { id: string; body: string; timecodeMs: number; drawing: Shape[] | null }) => createGuestComment({ data: { ...data, token, name } }),
    onMutate: async (data) => {
      await client.cancelQueries({ queryKey });
      client.setQueryData(queryKey, (old) => old && { ...old, comments: [...old.comments.filter((row) => row.id !== data.id),
        { ...data, authorName: name, drawing: data.drawing && JSON.stringify(data.drawing), resolvedAt: null, createdAt: Date.now(), isGuest: true },
      ].sort((a, b) => a.timecodeMs - b.timecodeMs || a.createdAt - b.createdAt) });
    },
    onError: (_error, data) => client.setQueryData(queryKey, (old) => old && { ...old, comments: old.comments.filter((row) => row.id !== data.id) }),
    onSettled: () => client.invalidateQueries({ queryKey }),
  });
  async function send() {
    if (!body.trim() && !drawing.length) { setFailure("Enter a Comment."); return; }
    const marks = drawing.length ? drawing : null;
    if (draft.current?.body !== body || JSON.stringify(draft.current.drawing) !== JSON.stringify(marks)) draft.current = { id: crypto.randomUUID(), body, timecodeMs: timeMs, drawing: marks };
    setFailure("");
    setResolved(false);
    try { await write.mutateAsync(draft.current); setBody(""); draft.current = null; sent(); }
    catch (error) { setFailure(isRateLimited(error) ? "Too many Comments right now. Your text is kept; wait a minute and try again." : "Could not send Comment. Your text is kept; try again."); }
  }
  const rows = page.comments.filter((comment) => (comment.resolvedAt !== null) === resolved);
  return <section aria-labelledby="comments-heading" className="min-w-0 rounded-lg border p-4">
    <h2 id="comments-heading" className="font-semibold">Comments</h2>
    <div role="group" aria-label="Comment filters" className="my-3 flex gap-2">
      <Button aria-pressed={!resolved} onClick={() => setResolved(false)}>To do</Button>
      <Button aria-pressed={resolved} onClick={() => setResolved(true)}>Resolved</Button>
    </div>
    {rows.length === 0 ? <p className="text-muted-foreground">{resolved ? "No Resolved Comments." : "No Comments to do."}</p> : <ul className="space-y-4" aria-label="Comments">
      {rows.map((comment) => <li key={comment.id} className="rounded border p-3 wrap-anywhere">
        <p className="text-sm">{comment.authorName}{comment.isGuest && " · Guest"}</p>
        <button className="min-h-11 w-full text-left underline" aria-current={selectedId === comment.id ? "true" : undefined}
          onClick={() => select(comment)}>{timeLabel(comment.timecodeMs)} · {comment.body}{comment.drawing && " · Drawing"}</button>
      </li>)}
    </ul>}
    {failure && <p role="alert" className="my-3">{failure}</p>}
    {drawingControls}
    {page.permission === "view" ? <p className="mt-4">This link is view-only.</p> : <form className="sticky bottom-0 mt-4 border-t bg-background py-3" onSubmit={(event) => { event.preventDefault(); void send(); }}>
      <label className="block" htmlFor="comment-body">Comment text</label>
      <textarea id="comment-body" aria-describedby="comment-time" className="min-h-24 w-full rounded border p-2" maxLength={5000} value={body} onChange={(event) => setBody(event.target.value)} readOnly={write.isPending} />
      <p id="comment-time" className="text-sm">At {timeLabel(timeMs)}</p>
      <Button type="submit" disabled={write.isPending}>Send Comment</Button>
    </form>}
  </section>;
}
