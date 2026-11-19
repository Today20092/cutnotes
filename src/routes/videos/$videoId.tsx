import * as v from "valibot";
import { idParam, param, positiveInt, secondsParam, sheetParam } from "@/lib/search-params";
import { ActionMenu } from "@/components/action-menu";
import { useCopyPageLink } from "@/components/copy-page-link";
import { ExportMarkers } from "@/components/export-markers";
import { useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CompleteBanner } from "@/components/complete-project";
import { MemberScreen } from "@/components/member-screen";
import { canUpload, canWrite, PageBreadcrumb, PageHeading } from "@/components/project-parts";
import { Skeleton } from "@/components/ui/skeleton";
import { Review as ReviewPanel, type ReviewView } from "@/components/comments";
import { ReviewQueue } from "@/components/review-queue";
import { ReviewDecisionBar } from "@/components/review-decision-bar";
import { CustomerLinkSheet } from "@/components/customer-link-sheet";
import { reviewQuery, useMemberActor, type ReviewPage } from "@/lib/review";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { UploadSheet } from "@/components/upload-parts";
import { markVideoRead } from "@/server/playback";
import { refreshProjects } from "@/lib/writes";

// An unknown value is dropped rather than shown as an error page.
const searchSchema = v.object({
  sheet: sheetParam(["customer", "upload", "markers"]),
  /** The Revision number; without it the latest. */
  revision: positiveInt,
  /** Opens at this moment, in seconds. */
  t: secondsParam,
  /** The selected Comment. */
  comment: idParam,
  filter: param(v.picklist(["todo", "resolved"])),
});

export const Route = createFileRoute("/videos/$videoId")({
  validateSearch: (search) => v.parse(searchSchema, search),
  head: () => ({ meta: [{ title: "Review · Cutnotes" }] }),
  component: Review,
});

function Review() {
  const { videoId } = Route.useParams();
  const client = useQueryClient();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { revision } = search;
  const setSearch = (change: Partial<typeof search>) =>
    void navigate({ search: (prev) => ({ ...prev, ...change }), replace: true });
  // A copied link opens the same cut at the same moment.
  const linkParams = new URLSearchParams();
  if (search.revision) linkParams.set("revision", String(search.revision));
  if (search.t !== undefined) linkParams.set("t", String(search.t));
  const linkSearch = linkParams.size ? `?${linkParams}` : "";
  const copyLink = useCopyPageLink("video", `/videos/${videoId}${linkSearch}`);
  const setSheet = (sheet: "customer" | "upload", open: boolean) =>
    setSearch({ sheet: open ? sheet : undefined });
  /**
   * Names the shown Revision in the URL, so a refetch never swaps the cut being reviewed and the
   * customer sheet never retargets. Seeding the pinned page keeps the player mounted.
   */
  const pin = (page: ReviewPage) => {
    const number = page.revision!.number;
    client.setQueryData(reviewQuery(videoId, undefined, number).queryKey, page);
    return number;
  };
  const latest = (page: ReviewPage) => page.history[0]!.number;
  return (
    <MemberScreen
      query={reviewQuery(videoId, client, revision)}
      skeleton={<Skeleton className="h-64" />}
    >
      {(page) =>
        !page.video ? (
          <>
            <PageHeading title="Video not found" />
            <Link to="/">Back to Projects</Link>
          </>
        ) : (
          <div className="flex flex-col gap-3" data-video-editor>
            <ReadMarker videoId={videoId} readAt={page.readAt} />
            {revision === undefined && page.revision && (
              <OnMount run={() => setSearch({ revision: pin(page) })} />
            )}
            <PageBreadcrumb
              trail={[
                { label: "Projects", link: <Link to="/" /> },
                {
                  label: page.video.projectName,
                  link: (
                    <Link to="/projects/$projectId" params={{ projectId: page.video.projectId }} />
                  ),
                },
              ]}
              current={page.video.title}
            />
            <PageHeading
              title={page.video.title}
              // At most two actions stay visible; the rest live in this menu.
              menu={
                <ActionMenu<"markers">
                  label={`More actions for ${page.video.title}`}
                  current={search.sheet}
                  onCurrentChange={(sheet) => setSearch({ sheet })}
                  actions={[
                    { label: "Copy video link", onSelect: () => void copyLink.copy() },
                    ...(canWrite(page.video.role) && page.revision
                      ? [
                          {
                            id: "markers" as const,
                            label: "Export markers",
                            sheet: (onClosed: () => void) => (
                              <ExportMarkers
                                key={page.revision!.id}
                                open
                                onOpenChange={(open) => !open && onClosed()}
                                title={page.video!.title}
                                revision={page.revision!.number}
                                comments={page.comments}
                                frameRate={page.revision!.frameRate}
                                durationMs={page.revision!.durationMs}
                              />
                            ),
                          },
                        ]
                      : []),
                  ]}
                />
              }
            >
              {canUpload(page.video.role) && page.video.completedAt === null && (
                <>
                  {page.member.role === "owner" && (
                    <>
                      {page.revision && (
                        <Button
                          variant="secondary"
                          onClick={() => setSearch({ sheet: "customer", revision: pin(page) })}
                        >
                          Send to customer
                        </Button>
                      )}
                      <CustomerLinkSheet
                        videoId={videoId}
                        title={page.video.title}
                        // Without a number, the shown Revision until OnMount writes it to the URL.
                        revision={
                          revision === undefined || page.revision?.number === revision
                            ? page.revision
                            : null
                        }
                        requested={revision}
                        open={search.sheet === "customer"}
                        onOpenChange={(open) => setSheet("customer", open)}
                      />
                    </>
                  )}
                  {(canWrite(page.video.role) || page.video.createdBy === page.member.id) && (
                    <UploadSheet
                      open={search.sheet === "upload"}
                      onOpenChange={(open) => setSheet("upload", open)}
                      destination={{ kind: "existing", videoId, title: page.video.title }}
                      trigger={<Button variant="secondary">Upload new Revision</Button>}
                    />
                  )}
                </>
              )}
            </PageHeading>
            {copyLink.feedback}
            <a href="#comments" className="sr-only focus:not-sr-only">
              Skip to Comments
            </a>
            {page.video.deleteAfter !== null && (
              <CompleteBanner deleteAfter={page.video.deleteAfter} />
            )}
            {page.revision && page.history[0]!.id !== page.revision.id && (
              <p role="status" className="text-sm">
                Revision {latest(page)} is ready.{" "}
                <Link
                  to="/videos/$videoId"
                  params={{ videoId }}
                  search={{ revision: latest(page) }}
                  className="font-medium underline underline-offset-4"
                >
                  Watch it
                </Link>
              </p>
            )}
            {canWrite(page.video.role) && page.video.completedAt === null && page.revision && (
              <ReviewDecisionBar
                videoId={videoId}
                title={page.video.title}
                status={page.video.status}
                revision={page.revision}
                latest={page.history[0]!}
                sendable={page.member.role === "owner"}
              />
            )}
            {page.history.length === 1 ? (
              <p className="text-sm text-muted-foreground">Revision {page.history[0]!.number}</p>
            ) : (
              <ToggleGroup
                aria-label="Revision history"
                className="flex-wrap"
                value={page.revision ? [page.revision.id] : []}
                onValueChange={(next: string[]) => {
                  const chosen = page.history.find((cut) => cut.id === next[0]);
                  if (chosen)
                    setSearch({ revision: chosen.number, comment: undefined, t: undefined });
                }}
              >
                {page.history.map((cut) => (
                  <ToggleGroupItem
                    key={cut.id}
                    value={cut.id}
                    className="h-11 aria-pressed:underline aria-pressed:decoration-2 aria-pressed:underline-offset-4 sm:pointer-fine:h-8"
                  >
                    Revision {cut.number}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            )}
            {page.revision && page.playback ? (
              <>
                <ReviewContent
                  key={page.revision.id}
                  page={page}
                  videoId={videoId}
                  cacheRevision={revision}
                  view={{ comment: search.comment, t: search.t, filter: search.filter }}
                  onViewChange={setSearch}
                />
              </>
            ) : revision !== undefined && page.history.length > 0 ? (
              <p role="status">
                Revision {revision} cannot be opened. It is not ready to watch, or it was removed.{" "}
                <Link
                  to="/videos/$videoId"
                  params={{ videoId }}
                  search={{ revision: latest(page) }}
                  className="font-medium underline underline-offset-4"
                >
                  Watch Revision {latest(page)}
                </Link>
              </p>
            ) : (
              <p role="status">
                No Revision is ready to watch yet. Return to the Project to check upload progress or
                retry a failed upload.
              </p>
            )}
          </div>
        )
      }
    </MemberScreen>
  );
}

/** Runs once when shown, for a URL that needs completing before the screen can use it. */
function OnMount({ run }: { run: () => void }) {
  const done = useRef(false);
  useEffect(() => {
    if (!done.current) run();
    done.current = true;
  });
  return null;
}

function ReadMarker({ videoId, readAt }: { videoId: string; readAt: number }) {
  const client = useQueryClient();
  const { mutate, isError } = useMutation({
    mutationFn: () => markVideoRead({ data: { videoId, readAt } }),
    onSuccess: () => refreshProjects(client),
  });
  useEffect(() => {
    if (document.visibilityState === "visible") mutate();
  }, [mutate, videoId, readAt]);
  return isError ? (
    <p role="alert">
      Could not update the unread marker.{" "}
      <Button variant="outline" onClick={() => mutate()}>
        Retry read marker
      </Button>
    </p>
  ) : null;
}

function ReviewContent({
  page,
  videoId,
  cacheRevision,
  view,
  onViewChange,
}: {
  page: ReviewPage;
  videoId: string;
  cacheRevision?: number;
  view: ReviewView;
  onViewChange: (change: Partial<ReviewView>) => void;
}) {
  const actor = useMemberActor(page, videoId, cacheRevision);
  return (
    <>
      <ReviewPanel
        videoId={videoId}
        revision={page.revision!}
        playback={page.playback!}
        comments={page.comments}
        actor={actor}
        view={view}
        onViewChange={onViewChange}
      />
      <ReviewQueue
        comments={page.comments}
        actor={actor}
        // The review panel owns playback; its list button seeks and selects.
        select={(comment) =>
          document.querySelector<HTMLButtonElement>(`#comment-${comment.id} button`)?.click()
        }
      />
    </>
  );
}
