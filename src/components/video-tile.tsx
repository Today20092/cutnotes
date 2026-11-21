import { DeleteWork } from "@/components/delete-work";
import { Ellipsis, RotateCcw } from "lucide-react";
import { useRef, useState } from "react";
import { ProjectNameSheet, VideoCard, WriteFeedback } from "@/components/project-parts";
import { UploadSheet } from "@/components/upload-parts";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu";
import { useRenameVideo, type VideoSummary } from "@/lib/projects";

/** The Video sheets the Project page keeps in its URL (`?sheet=…&video=<id>`). */
export type VideoSheet = "rename-video" | "delete-video" | "retry-video" | "upload-revision";

export function VideoTile({
  video,
  writable,
  uploadable,
  deletable,
  sheet,
  onSheetChange,
}: {
  video: VideoSummary;
  writable: boolean;
  uploadable: boolean;
  deletable: boolean;
  sheet?: string;
  onSheetChange: (sheet?: VideoSheet) => void;
}) {
  const more = useRef<HTMLButtonElement>(null);
  function closeSheet() {
    onSheetChange(undefined);
    // The sheet unmounts with focus inside it.
    requestAnimationFrame(() => more.current?.focus());
  }
  const renameVideo = useRenameVideo(video.id);
  const [status, setStatus] = useState("");
  const [failure, setFailure] = useState("");

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

  const open = video.projectCompletedAt === null;
  const canRename = open && writable;
  const canUpload = open && uploadable;
  const canDelete = open && deletable;
  const canRetry = canUpload && video.latestRevisionState === "errored";
  const revisionUpload = canUpload && sheet === "upload-revision";

  const actions = (canRename || canUpload || canDelete) && (
    <div className="-mr-2.5 -mt-1.5 flex shrink-0 flex-wrap items-center justify-end gap-2">
      {(canRetry || revisionUpload) && (
        <UploadSheet
          open={revisionUpload || sheet === "retry-video"}
          onOpenChange={(next) => {
            if (!next && revisionUpload) closeSheet();
            else onSheetChange(next ? "retry-video" : undefined);
          }}
          destination={{ kind: "existing", videoId: video.id, title: video.title }}
          trigger={
            canRetry ? (
              <Button variant="secondary" aria-label={`Retry ${video.title} with a new upload`}>
                <RotateCcw aria-hidden /> Retry
              </Button>
            ) : undefined
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
        <MenuPopup align="end">
          {canUpload && (
            <MenuItem className="min-h-11" onSelect={() => onSheetChange("upload-revision")}>
              Upload new Revision
            </MenuItem>
          )}
          {canRename && (
            <MenuItem className="min-h-11" onSelect={() => onSheetChange("rename-video")}>
              Rename
            </MenuItem>
          )}
          {canDelete && (
            <MenuItem
              className="min-h-11"
              variant="destructive"
              onSelect={() => onSheetChange("delete-video")}
            >
              Delete
            </MenuItem>
          )}
        </MenuPopup>
      </Menu>
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="block min-[400px]:flex min-[400px]:gap-3 sm:block">
        <VideoCard video={video} actions={actions} />
      </div>
      {canRename && sheet === "rename-video" && (
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
      {deletable && sheet === "delete-video" && (
        <DeleteWork kind="Video" id={video.id} name={video.title} startOpen onClosed={closeSheet} />
      )}
      {!open && deletable && <DeleteWork kind="Video" id={video.id} name={video.title} />}
      <WriteFeedback status={status} failure={failure} />
    </div>
  );
}
