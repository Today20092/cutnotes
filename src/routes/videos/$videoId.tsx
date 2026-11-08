import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MemberScreen } from "@/components/member-screen";
import { PageHeading } from "@/components/project-parts";
import { VideoPlayer } from "@/components/player/video-player";
import { Skeleton } from "@/components/ui/skeleton";
import { Comments, selectComment, timeLabel } from "@/components/comments";
import { reviewQuery, type Comment, type ReviewPage } from "@/lib/review";

export const Route = createFileRoute("/videos/$videoId")({ component: Review });

function Review() {
  const { videoId } = Route.useParams();
  const client = useQueryClient();
  return <MemberScreen query={reviewQuery(videoId, client)} skeleton={<Skeleton className="h-64" />}>
    {(page) => !page.video ? <><PageHeading title="Video not found" /><Link to="/">Back to Projects</Link></> : <div className="flex flex-col gap-4" data-video-editor>
      <Link to="/projects/$projectId" params={{ projectId: page.video.projectId }} className="min-h-11 underline">Back to {page.video.projectName}</Link>
      <PageHeading title={page.video.title} />
      {page.revision && page.playback ? <>
        <p>Revision {page.revision.number}</p>
        <ReviewContent key={page.revision.id} page={page} videoId={videoId} />
      </> : <p role="status">No Revision is ready to watch yet. Return to the Project to check upload progress or retry a failed upload.</p>}
    </div>}
  </MemberScreen>;
}

function ReviewContent({ page, videoId }: { page: ReviewPage; videoId: string }) {
  const player = useRef<HTMLDivElement>(null);
  const [timeMs, setTimeMs] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const revision = page.revision!;
  function select(comment: Comment) { selectComment(player, comment); setSelectedId(comment.id); setTimeMs(comment.timecodeMs); }
  return <div className="review-layout">
    <div ref={player} className="review-player" onTimeUpdate={(event) => {
      if (event.target instanceof HTMLVideoElement) setTimeMs(Math.round(event.target.currentTime * 1000));
    }}>
      <VideoPlayer videoId={videoId} revisionId={revision.id} frameRate={revision.frameRate} playback={page.playback!} />
      <div role="group" aria-label="Comment timeline markers" className="relative mt-2 h-12 border-b-2 border-current">
        {page.comments.map((comment) => <button key={comment.id} type="button"
          className="absolute bottom-0 min-h-11 min-w-6 -translate-x-1/2 border-current text-center focus-visible:outline-2"
          style={{ left: `${Math.max(2, Math.min(98, comment.timecodeMs / (revision.durationMs || 1) * 100))}%` }}
          aria-label={`Comment at ${timeLabel(comment.timecodeMs)}: ${comment.body}`} aria-current={selectedId === comment.id ? "true" : undefined}
          onClick={() => select(comment)}>◆</button>)}
      </div>
    </div>
    <Comments page={page} videoId={videoId} timeMs={timeMs} select={select} selectedId={selectedId} />
  </div>;
}
