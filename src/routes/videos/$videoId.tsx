import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CompleteBanner } from "@/components/complete-project";
import { MemberScreen } from "@/components/member-screen";
import { PageHeading } from "@/components/project-parts";
import { VideoPlayer } from "@/components/player/video-player";
import { Skeleton } from "@/components/ui/skeleton";
import { CommentMarkers, Comments } from "@/components/comments";
import { ShareLinksSheet } from "@/components/share-links";
import { reviewQuery, type Comment, type ReviewPage } from "@/lib/review";
import { useDrawingControls } from "@/components/drawing-controls";
import { Button } from "@/components/ui/button";
import { UploadSheet } from "@/components/upload-parts";
import { markVideoRead } from "@/server/playback";

export const Route = createFileRoute("/videos/$videoId")({ head: () => ({ meta: [{ title: "Review · Cutnotes" }] }), component: Review });

function Review() {
  const { videoId } = Route.useParams();
  const client = useQueryClient();
  const [revisionId, setRevisionId] = useState<string>();
  return <MemberScreen query={reviewQuery(videoId, client, revisionId)} skeleton={<Skeleton className="h-64" />}>
    {(page) => !page.video ? <><PageHeading title="Video not found" /><Link to="/">Back to Projects</Link></> : <div className="flex flex-col gap-4" data-video-editor>
      <ReadMarker videoId={videoId} readAt={page.readAt} />
      <Link to="/projects/$projectId" params={{ projectId: page.video.projectId }} className="min-h-11 underline">Back to {page.video.projectName}</Link>
      <PageHeading title={page.video.title} />
      <a href="#comments" className="sr-only focus:not-sr-only">Skip to Comments</a>
      {page.video.deleteAfter !== null && <CompleteBanner deleteAfter={page.video.deleteAfter} />}
      {page.member.role !== "viewer" && page.video.completedAt === null && <UploadSheet
        destination={{ kind: "existing", videoId, title: page.video.title }}
        trigger={<Button variant="outline">Upload new Revision</Button>} />}
      {page.member.role !== "viewer" && page.video.completedAt === null && <ShareLinksSheet videoId={videoId} />}
      <div role="group" aria-label="Revision history" className="flex flex-wrap gap-2">
        {page.history.map((cut) => <Button key={cut.id} variant="outline" aria-pressed={page.revision?.id === cut.id}
          onClick={() => setRevisionId(cut.id)}>Revision {cut.number}</Button>)}
        {revisionId && <Button variant="outline" onClick={() => setRevisionId(undefined)}>Latest Revision</Button>}
      </div>
      {page.revision && page.playback ? <>
        <p>Revision {page.revision.number}</p>
        <ReviewContent key={page.revision.id} page={page} videoId={videoId} cacheRevisionId={revisionId} />
      </> : <p role="status">No Revision is ready to watch yet. Return to the Project to check upload progress or retry a failed upload.</p>}
    </div>}
  </MemberScreen>;
}

function ReadMarker({ videoId, readAt }: { videoId: string; readAt: number }) {
  const client = useQueryClient();
  const { mutate, isError } = useMutation({
    mutationFn: () => markVideoRead({ data: { videoId, readAt } }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["projects"] }),
  });
  useEffect(() => { if (document.visibilityState === "visible") mutate(); }, [mutate, videoId, readAt]);
  return isError ? <p role="alert">Could not update the unread marker. <Button variant="outline" onClick={() => mutate()}>Retry read marker</Button></p> : null;
}

function ReviewContent({ page, videoId, cacheRevisionId }: { page: ReviewPage; videoId: string; cacheRevisionId?: string }) {
  const [seek, setSeek] = useState<{ timeMs: number }>();
  const [timeMs, setTimeMs] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const pen = useDrawingControls({ timeMs, seek: (ms) => setSeek({ timeMs: ms }), deselect: () => setSelectedId(null) });
  const revision = page.revision!;
  function select(comment: Comment) { setSeek({ timeMs: comment.timecodeMs }); setSelectedId(comment.id); setTimeMs(comment.timecodeMs); pen.stop(); }
  return <div className="review-layout">
    <div className="review-player" onTimeUpdate={(event) => {
      if (event.target instanceof HTMLVideoElement) setTimeMs(Math.round(event.target.currentTime * 1000));
    }}>
      <VideoPlayer videoId={videoId} revisionId={revision.id} frameRate={revision.frameRate} playback={page.playback!} seek={seek}
        drawing={pen.overlay(selectedId === null ? undefined : { drawing: page.comments.find((c) => c.id === selectedId)?.drawing ?? null })}
        timelineMarkers={<CommentMarkers comments={page.comments} durationMs={revision.durationMs} selectedId={selectedId} select={select} />} />
    </div>
    <Comments page={page} videoId={videoId} timeMs={pen.time} select={select} selectedId={selectedId} cacheRevisionId={cacheRevisionId} drawing={pen.drawing}
      sent={pen.reset} drawingControls={page.video?.completedAt === null && pen.controls} />
  </div>;
}
