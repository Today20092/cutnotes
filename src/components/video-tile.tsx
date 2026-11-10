import { Link } from "@tanstack/react-router";
import { DeleteWork } from "@/components/delete-work";
import { Ellipsis, RotateCcw } from "lucide-react";
import { useId, useRef, useState } from "react";
import {
  ProjectNameSheet,
  selectClass,
  statusLabels,
  VideoCard,
  WriteFeedback,
} from "@/components/project-parts";
import { UploadSheet } from "@/components/upload-parts";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu";
import { useRenameVideo, useSetVideoStatus, type VideoSummary } from "@/lib/projects";
import { videoStatuses, type VideoStatus } from "@/server/db/schema";

function VideoControls({ video, deletable }: { video: VideoSummary; deletable: boolean }) {
  const [sheet, setSheet] = useState<"rename" | "delete" | null>(null);
  const more = useRef<HTMLButtonElement>(null);
  function closeSheet() {
    setSheet(null);
    // The sheet unmounts with focus inside it.
    requestAnimationFrame(() => more.current?.focus());
  }
  const renameVideo = useRenameVideo(video.id);
  const setVideoStatus = useSetVideoStatus(video.id);
  const [status, setStatus] = useState("");
  const [failure, setFailure] = useState("");
  const selectId = useId();

  function changeStatus(next: VideoStatus) {
    setFailure("");
    setVideoStatus.mutate(
      { videoId: video.id, status: next },
      {
        onSuccess: () => setStatus(`${video.title} is now ${statusLabels[next]}`),
        onError: () => setFailure(`Could not change the Status of ${video.title}. Try again.`),
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
    <div className="mt-2 ml-31 flex flex-col gap-2 sm:ml-0">
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
        {video.latestRevisionState === "errored" && (
          <UploadSheet
            destination={{ kind: "existing", videoId: video.id, title: video.title }}
            trigger={
              <Button variant="secondary" aria-label={`Retry ${video.title} with a new upload`}>
                <RotateCcw aria-hidden /> Retry
              </Button>
            }
          />
        )}
        <Menu>
          <MenuTrigger
            render={
              <Button
                ref={more}
                variant="ghost"
                size="icon"
                aria-label={`More actions for ${video.title}`}
              />
            }
          >
            <Ellipsis aria-hidden />
          </MenuTrigger>
          <MenuPopup>
            <MenuItem onClick={() => setSheet("rename")}>Rename</MenuItem>
            {deletable && (
              <MenuItem variant="destructive" onClick={() => setSheet("delete")}>
                Delete
              </MenuItem>
            )}
          </MenuPopup>
        </Menu>
      </div>
      {sheet === "rename" && (
        <ProjectNameSheet
          title="Rename Video"
          submitLabel="Save title"
          fieldLabel="Video title"
          emptyMessage="Enter a title for the Video."
          initialName={video.title}
          onSubmit={rename}
          startOpen
          onClosed={closeSheet}
        />
      )}
      {sheet === "delete" && (
        <DeleteWork kind="Video" id={video.id} name={video.title} startOpen onClosed={closeSheet} />
      )}
      <WriteFeedback status={status} failure={failure} />
    </div>
  );
}

export function VideoTile({
  video,
  writable,
  deletable = false,
}: {
  video: VideoSummary;
  writable: boolean;
  deletable?: boolean;
}) {
  const manageable = writable && video.projectCompletedAt === null;
  const card = <VideoCard video={video} showStatus={!manageable} />;
  return (
    <>
      <Link to="/videos/$videoId" params={{ videoId: video.id }} className="flex gap-3 sm:block">
        {card}
      </Link>
      {manageable && <VideoControls video={video} deletable={deletable} />}
      {!manageable && deletable && (
        <div className="mt-2">
          <DeleteWork kind="Video" id={video.id} name={video.title} />
        </div>
      )}
    </>
  );
}
