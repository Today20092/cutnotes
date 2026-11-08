import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MemberScreen } from "@/components/member-screen";
import { PageHeading } from "@/components/project-parts";
import { VideoPlayer } from "@/components/player/video-player";
import { Skeleton } from "@/components/ui/skeleton";
import { Comments, timeLabel } from "@/components/comments";
import { reviewQuery, type Comment, type ReviewPage } from "@/lib/review";
import { drawingColors, readDrawing, validDrawing, type Shape, type Tool } from "@/lib/drawing";
import { Button } from "@/components/ui/button";
import { UploadSheet } from "@/components/upload-parts";
import { markVideoRead } from "@/server/playback";

export const Route = createFileRoute("/videos/$videoId")({ component: Review });

function Review() {
  const { videoId } = Route.useParams();
  const client = useQueryClient();
  const [revisionId, setRevisionId] = useState<string>();
  return <MemberScreen query={reviewQuery(videoId, client, revisionId)} skeleton={<Skeleton className="h-64" />}>
    {(page) => !page.video ? <><PageHeading title="Video not found" /><Link to="/">Back to Projects</Link></> : <div className="flex flex-col gap-4" data-video-editor>
      <ReadMarker videoId={videoId} readAt={page.readAt} />
      <Link to="/projects/$projectId" params={{ projectId: page.video.projectId }} className="min-h-11 underline">Back to {page.video.projectName}</Link>
      <PageHeading title={page.video.title} />
      {page.member.role !== "viewer" && page.video.completedAt === null && <UploadSheet
        destination={{ kind: "existing", videoId, title: page.video.title }}
        trigger={<Button variant="outline">Upload new Revision</Button>} />}
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
  const [drawing, setDrawing] = useState<Shape[]>([]);
  const [drawingActive, setDrawingActive] = useState(false);
  const [drawingTime, setDrawingTime] = useState<number | null>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState<string>(drawingColors[0]);
  const [drawingError, setDrawingError] = useState("");
  const drawButton = useRef<HTMLButtonElement>(null);
  const revision = page.revision!;
  function select(comment: Comment) { setSeek({ timeMs: comment.timecodeMs }); setSelectedId(comment.id); setTimeMs(comment.timecodeMs); setDrawingActive(false); }
  function changeDrawing(shapes: Shape[]) {
    if (shapes.length && !validDrawing(shapes)) { setDrawingError("Drawing is too large. Undo or clear before continuing."); return; }
    setDrawingError(""); setDrawing(shapes);
  }
  return <div className="review-layout">
    <div className="review-player" onTimeUpdate={(event) => {
      if (event.target instanceof HTMLVideoElement) setTimeMs(Math.round(event.target.currentTime * 1000));
    }}>
      <VideoPlayer videoId={videoId} revisionId={revision.id} frameRate={revision.frameRate} playback={page.playback!} seek={seek}
        drawing={{ shapes: drawingActive || selectedId === null ? drawing : readDrawing(page.comments.find((c) => c.id === selectedId)?.drawing ?? null), active: drawingActive, tool, color, change: changeDrawing }}
        timelineMarkers={<div role="group" aria-label="Comment timeline markers" className="relative mt-2 h-12 border-b-2 border-current">
        {page.comments.map((comment) => <button key={comment.id} type="button"
          className="absolute bottom-0 min-h-11 min-w-6 -translate-x-1/2 border-current text-center focus-visible:outline-2"
          style={{ left: `${Math.max(2, Math.min(98, comment.timecodeMs / (revision.durationMs || 1) * 100))}%` }}
          aria-label={`Comment at ${timeLabel(comment.timecodeMs)}: ${comment.body}`} aria-current={selectedId === comment.id ? "true" : undefined}
          onClick={() => select(comment)}>◆</button>)}
      </div>} />
    </div>
    <Comments page={page} videoId={videoId} timeMs={drawing.length ? drawingTime ?? timeMs : timeMs} select={select} selectedId={selectedId} cacheRevisionId={cacheRevisionId} drawing={drawing}
      sent={() => { setDrawing([]); setDrawingActive(false); setDrawingTime(null); }} drawingControls={
      page.video?.completedAt === null && <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Drawing controls">
        <Button ref={drawButton} aria-pressed={drawingActive} onClick={() => {
          if (drawingActive) { setDrawingActive(false); requestAnimationFrame(() => drawButton.current?.focus()); }
          else { setSeek({ timeMs: drawing.length ? drawingTime ?? timeMs : timeMs }); if (!drawing.length) setDrawingTime(timeMs); setSelectedId(null); setDrawingActive(true); }
        }}>{drawingActive ? "Finish Drawing" : "Draw"}</Button>
        {drawingActive && <>
          {(["pen", "arrow", "box"] as const).map((name) => <Button key={name} aria-label={name.charAt(0).toUpperCase() + name.slice(1)} aria-pressed={tool === name} onClick={() => setTool(name)}><span aria-hidden="true">{tool === name ? "✓ " : ""}</span>{name.charAt(0).toUpperCase() + name.slice(1)}</Button>)}
          {drawingColors.map((value, i) => <Button key={value} aria-label={["Red", "Yellow", "Green", "Blue", "White"][i]} aria-pressed={color === value} onClick={() => setColor(value)}><span aria-hidden="true">{color === value ? "✓ " : ""}</span>{["Red", "Yellow", "Green", "Blue", "White"][i]}</Button>)}
          <Button disabled={!drawing.length} onClick={() => changeDrawing(drawing.slice(0, -1))}>Undo Drawing</Button>
          <Button disabled={!drawing.length} onClick={() => changeDrawing([])}>Clear Drawing</Button>
          <p>Draw on the picture, or leave a timestamped Comment below.</p>
        </>}
        {drawingError && <p role="alert">{drawingError}</p>}
      </div>
      } />
  </div>;
}
