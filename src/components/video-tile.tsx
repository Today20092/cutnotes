import { NativeSelect } from "@/components/ui/native-select";
import { statusTone } from "@/components/video-status";
import { PendingButton } from "@/components/pending-button";
import { toastManager } from "@/components/ui/toast";
import { Input } from "@/components/ui/input";
import { Link } from "@tanstack/react-router";
import { DeleteWork } from "@/components/delete-work";
import { Check, Ellipsis, Pencil, RotateCcw, X } from "lucide-react";
import { useCallback, useId, useRef, useState } from "react";
import {
  ProjectNameSheet,
  statusLabels,
  VideoCard,
  WriteFeedback,
} from "@/components/project-parts";
import { UploadSheet } from "@/components/upload-parts";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu";
import { useRenameVideo, useSetVideoStatus, type VideoSummary } from "@/lib/projects";
import { videoStatuses, type VideoStatus } from "@/server/db/schema";

function EditableVideoTitle({ video }: { video: VideoSummary }) {
  const rename = useRenameVideo(video.id);
  const focusInput = useCallback((input: HTMLInputElement | null) => {
    input?.focus();
    input?.select();
  }, []);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(video.title);
  const [error, setError] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  function close() {
    setEditing(false);
    requestAnimationFrame(() => trigger.current?.focus());
  }
  if (!editing)
    return (
      <button
        ref={trigger}
        type="button"
        className="inline-flex min-h-11 items-center gap-2 rounded text-left hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        aria-label={`Rename ${video.title}`}
        onClick={() => {
          setDraft(video.title);
          setError("");
          setEditing(true);
        }}
      >
        {video.title}
        <Pencil className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      </button>
    );
  return (
    <form
      className="flex h-11 min-w-0 items-center gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        if (rename.isPending) return;
        const title = draft.trim();
        if (!title) {
          setError("Enter a video title.");
          toastManager.add({ title: "Enter a video title.", type: "error" });
          return;
        }
        if (title === video.title) {
          close();
          return;
        }
        setError("");
        rename.mutate(
          { videoId: video.id, title },
          {
            onSuccess: () => {
              toastManager.add({ title: "Video renamed" });
              close();
            },
            onError: () => {
              setError("Could not save the title. Try again.");
              toastManager.add({ title: "Could not save the title. Try again.", type: "error" });
            },
          },
        );
      }}
    >
      <Input
        className="h-11 min-w-0 flex-1"
        ref={focusInput}
        aria-label="Video title"
        value={draft}
        maxLength={120}
        disabled={rename.isPending}
        aria-invalid={!!error}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !rename.isPending) {
            event.preventDefault();
            close();
          }
        }}
      />
      <div className="flex shrink-0 gap-1">
        <PendingButton
          pending={rename.isPending}
          size="icon"
          variant="ghost"
          type="submit"
          aria-label="Save title"
          title="Save title"
          disabled={rename.isPending}
        >
          {!rename.isPending && <Check aria-hidden />}
        </PendingButton>
        <Button
          size="icon"
          variant="ghost"
          type="button"
          aria-label="Cancel rename"
          title="Cancel rename"
          disabled={rename.isPending}
          onClick={close}
        >
          <X aria-hidden />
        </Button>
      </div>
      {error && (
        <p role="alert" className="sr-only">
          {error}
        </p>
      )}
    </form>
  );
}

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
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={selectId} className="text-sm text-muted-foreground">
          Status<span className="sr-only"> of {video.title}</span>
        </label>
        <NativeSelect
          id={selectId}
          className={statusTone[video.status]}
          disabled={setVideoStatus.isPending}
          value={video.status}
          onChange={(event) => changeStatus(event.target.value as VideoStatus)}
        >
          {videoStatuses.map((value) => (
            <option key={value} value={value}>
              {statusLabels[value]}
            </option>
          ))}
        </NativeSelect>
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
      {manageable ? (
        <div className="block min-[400px]:flex min-[400px]:gap-3 sm:block">
          <VideoCard
            video={video}
            showStatus={false}
            editableTitle={<EditableVideoTitle video={video} />}
          />
        </div>
      ) : (
        <Link
          to="/videos/$videoId"
          params={{ videoId: video.id }}
          className="block min-[400px]:flex min-[400px]:gap-3 sm:block"
        >
          {card}
        </Link>
      )}
      {manageable && <VideoControls video={video} deletable={deletable} />}
      {!manageable && deletable && (
        <div className="mt-2">
          <DeleteWork kind="Video" id={video.id} name={video.title} />
        </div>
      )}
    </>
  );
}
