import { Link } from "@tanstack/react-router";
import { Pencil, RotateCcw } from "lucide-react";
import { useId, useState } from "react";
import {
  ProjectNameSheet,
  selectClass,
  statusLabels,
  VideoCard,
  WriteFeedback,
} from "@/components/project-parts";
import { UploadSheet } from "@/components/upload-parts";
import { Button } from "@/components/ui/button";
import {
  useRenameVideo,
  useSetVideoStatus,
  type VideoSummary,
} from "@/lib/projects";
import { videoStatuses, type VideoStatus } from "@/server/db/schema";

function VideoControls({ video }: { video: VideoSummary }) {
  const renameVideo = useRenameVideo();
  const setVideoStatus = useSetVideoStatus();
  const [status, setStatus] = useState("");
  const [failure, setFailure] = useState("");
  const selectId = useId();

  function changeStatus(next: VideoStatus) {
    setFailure("");
    setVideoStatus.mutate(
      { videoId: video.id, status: next },
      {
        onSuccess: () =>
          setStatus(`${video.title} is now ${statusLabels[next]}`),
        onError: () =>
          setFailure(`Could not change the Status of ${video.title}. Try again.`),
      },
    );
  }

  function rename(title: string) {
    setFailure("");
    const previous = video.title;
    renameVideo.mutate(
      { videoId: video.id, title },
      {
        onSuccess: () => setStatus(`Video renamed to ${title}`),
        onError: () => setFailure(`Could not rename ${previous}. Try again.`),
      },
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <label htmlFor={selectId} className="sr-only">
          Status of {video.title}
        </label>
        <select
          id={selectId}
          className={`${selectClass} min-w-0 flex-1`}
          value={video.status}
          onChange={(event) => changeStatus(event.target.value as VideoStatus)}
        >
          {videoStatuses.map((value) => (
            <option key={value} value={value}>
              {statusLabels[value]}
            </option>
          ))}
        </select>
        <ProjectNameSheet
          title="Rename Video"
          submitLabel="Save title"
          fieldLabel="Video title"
          emptyMessage="Enter a title for the Video."
          initialName={video.title}
          onSubmit={rename}
          trigger={
            <Button variant="outline" size="icon" aria-label={`Rename ${video.title}`}>
              <Pencil aria-hidden />
            </Button>
          }
        />
        {video.latestRevisionState === "errored" && (
          <UploadSheet
            destination={{ kind: "existing", videoId: video.id, title: video.title }}
            trigger={
              <Button variant="outline" aria-label={`Upload ${video.title} again`}>
                <RotateCcw aria-hidden /> Retry
              </Button>
            }
          />
        )}
      </div>
      <WriteFeedback status={status} failure={failure} />
    </div>
  );
}

export function VideoTile({
  video,
  writable,
  linkToProject = false,
}: {
  video: VideoSummary;
  writable: boolean;
  linkToProject?: boolean;
}) {
  const manageable = writable && video.projectCompletedAt === null;
  const card = <VideoCard video={video} showStatus={!manageable} />;
  return (
    <>
      {linkToProject ? (
        <Link
          to="/projects/$projectId"
          params={{ projectId: video.projectId }}
          aria-label={`${video.title}, in ${video.projectName}`}
          className="block"
        >
          {card}
        </Link>
      ) : (
        card
      )}
      {manageable && <VideoControls video={video} />}
    </>
  );
}
