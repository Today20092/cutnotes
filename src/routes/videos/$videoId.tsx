import { queryOptions } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MemberScreen } from "@/components/member-screen";
import { PageHeading } from "@/components/project-parts";
import { VideoPlayer } from "@/components/player/video-player";
import { Skeleton } from "@/components/ui/skeleton";
import { getReview } from "@/server/playback";

const reviewQuery = (videoId: string) => queryOptions({
  queryKey: ["review", videoId], queryFn: () => getReview({ data: { videoId } }),
  retry: false, refetchInterval: 30_000,
});

export const Route = createFileRoute("/videos/$videoId")({ component: Review });

function Review() {
  const { videoId } = Route.useParams();
  return <MemberScreen query={reviewQuery(videoId)} skeleton={<Skeleton className="h-64" />}>
    {(page) => !page.video ? <><PageHeading title="Video not found" /><Link to="/">Back to Projects</Link></> : <div className="flex flex-col gap-4" data-video-editor>
      <Link to="/projects/$projectId" params={{ projectId: page.video.projectId }} className="min-h-11 underline">Back to {page.video.projectName}</Link>
      <PageHeading title={page.video.title} />
      {page.revision && page.playback ? <>
        <p>Revision {page.revision.number}</p>
        <div className="review-layout">
          <div className="review-player">
            <VideoPlayer key={page.revision.id} videoId={videoId} revisionId={page.revision.id}
              frameRate={page.revision.frameRate} playback={page.playback} />
          </div>
          <section aria-labelledby="comments-heading" className="min-w-0 rounded-lg border p-4">
            <h2 id="comments-heading" className="font-semibold">Comments</h2>
            <p className="mt-4 text-muted-foreground">Comments will appear here.</p>
          </section>
        </div>
      </> : <p role="status">No Revision is ready to watch yet. Return to the Project to check upload progress or retry a failed upload.</p>}
    </div>}
  </MemberScreen>;
}
