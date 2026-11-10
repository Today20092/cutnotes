import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CompleteBanner } from "@/components/complete-project";
import { MemberScreen } from "@/components/member-screen";
import { PageBreadcrumb, PageHeading } from "@/components/project-parts";
import { Skeleton } from "@/components/ui/skeleton";
import { Review as ReviewPanel } from "@/components/comments";
import { ShareLinksSheet } from "@/components/share-links";
import { reviewQuery, useMemberActor, type ReviewPage } from "@/lib/review";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { UploadSheet } from "@/components/upload-parts";
import { markVideoRead } from "@/server/playback";
import { refreshProjects } from "@/lib/writes";

export const Route = createFileRoute("/videos/$videoId")({
  head: () => ({ meta: [{ title: "Review · Cutnotes" }] }),
  component: Review,
});

function Review() {
  const { videoId } = Route.useParams();
  const client = useQueryClient();
  const [revisionId, setRevisionId] = useState<string>();
  return (
    <MemberScreen
      query={reviewQuery(videoId, client, revisionId)}
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
            <PageHeading title={page.video.title}>
              {page.member.role !== "viewer" && page.video.completedAt === null && (
                <>
                  <ShareLinksSheet videoId={videoId} />
                  <UploadSheet
                    destination={{ kind: "existing", videoId, title: page.video.title }}
                    trigger={<Button variant="secondary">Upload new Revision</Button>}
                  />
                </>
              )}
            </PageHeading>
            <a href="#comments" className="sr-only focus:not-sr-only">
              Skip to Comments
            </a>
            {page.video.deleteAfter !== null && (
              <CompleteBanner deleteAfter={page.video.deleteAfter} />
            )}
            {page.history.length === 1 ? (
              <p className="text-sm text-muted-foreground">Revision {page.history[0]!.number}</p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <ToggleGroup
                  aria-label="Revision history"
                  className="flex-wrap"
                  value={page.revision ? [page.revision.id] : []}
                  onValueChange={(next: string[]) => {
                    if (next[0]) setRevisionId(next[0]);
                  }}
                >
                  {page.history.map((cut) => (
                    <ToggleGroupItem
                      key={cut.id}
                      value={cut.id}
                      className="h-11 aria-pressed:underline aria-pressed:decoration-2 aria-pressed:underline-offset-4 sm:h-8"
                    >
                      Revision {cut.number}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                {revisionId && (
                  <Button variant="ghost" onClick={() => setRevisionId(undefined)}>
                    Latest Revision
                  </Button>
                )}
              </div>
            )}
            {page.revision && page.playback ? (
              <>
                <ReviewContent
                  key={page.revision.id}
                  page={page}
                  videoId={videoId}
                  cacheRevisionId={revisionId}
                />
              </>
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
  cacheRevisionId,
}: {
  page: ReviewPage;
  videoId: string;
  cacheRevisionId?: string;
}) {
  const actor = useMemberActor(page, videoId, cacheRevisionId);
  return (
    <ReviewPanel
      videoId={videoId}
      revision={page.revision!}
      playback={page.playback!}
      comments={page.comments}
      actor={actor}
    />
  );
}
