import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import {
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
} from "react";
import { selectClass } from "@/components/project-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  checkUploadLimits,
  dismissUpload,
  enqueueUpload,
  retryUpload,
  stopUpload,
  useUploads,
  type UploadItem,
  type UploadTarget,
} from "@/lib/uploads";

const MAX_TITLE_LENGTH = 120;

// A sheet on phones and a centred dialog on wider screens.
const desktopDialogClass =
  "data-[side=right]:inset-y-auto data-[side=right]:top-1/2 data-[side=right]:right-auto data-[side=right]:left-1/2 data-[side=right]:h-auto data-[side=right]:w-[calc(100%-2rem)] data-[side=right]:max-w-md data-[side=right]:sm:max-w-md data-[side=right]:-translate-x-1/2 data-[side=right]:-translate-y-1/2 data-[side=right]:rounded-lg data-[side=right]:border";

type Destination =
  | { kind: "new"; projects: { id: string; name: string }[] }
  | { kind: "existing"; videoId: string; title: string };

function titleFromFile(name: string) {
  return name.replace(/\.[^.]+$/, "").slice(0, MAX_TITLE_LENGTH);
}

export function UploadSheet({
  trigger,
  destination,
}: {
  trigger: ReactElement;
  destination: Destination;
}) {
  const client = useQueryClient();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File>();
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState("");
  const [error, setError] = useState("");
  const limitCheck = useRef<Promise<string | null>>(Promise.resolve(null));
  const fileInput = useRef<HTMLInputElement>(null);
  const fileId = useId();
  const projectFieldId = useId();
  const titleId = useId();
  const errorId = useId();

  const projects = destination.kind === "new" ? destination.projects : [];
  const noProjects = destination.kind === "new" && projects.length === 0;
  const chosenProject = projects.some(({ id }) => id === projectId)
    ? projectId
    : (projects[0]?.id ?? "");

  function changeOpen(next: boolean) {
    setOpen(next);
    if (next) {
      setFile(undefined);
      setTitle("");
      setError("");
      limitCheck.current = Promise.resolve(null);
    }
  }

  function pickFile(picked: File | undefined) {
    setFile(picked);
    setError("");
    if (!picked) return;
    if (destination.kind === "new" && !title.trim()) {
      setTitle(titleFromFile(picked.name));
    }
    const check = checkUploadLimits(picked);
    limitCheck.current = check;
    void check.then((refusal) => {
      if (refusal && limitCheck.current === check) setError(refusal);
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const check = limitCheck.current;
    const refusal = await check;
    if (check !== limitCheck.current) return;
    const trimmed = title.trim();
    let problem = refusal ?? "";
    if (!problem && !file) problem = "Choose a video file.";
    if (!problem && destination.kind === "new" && !chosenProject) {
      problem = "Create a Project first.";
    }
    if (!problem && destination.kind === "new" && !trimmed) {
      problem = "Enter a title for the Video.";
    }
    if (!problem && trimmed.length > MAX_TITLE_LENGTH) {
      problem = `Keep the title to ${MAX_TITLE_LENGTH} characters.`;
    }
    if (problem || !file) {
      setError(problem);
      fileInput.current?.focus();
      return;
    }

    const target: UploadTarget =
      destination.kind === "new"
        ? { projectId: chosenProject, title: trimmed }
        : { videoId: destination.videoId };
    const label = destination.kind === "new" ? trimmed : destination.title;
    enqueueUpload({ file, label, target, client });
    setOpen(false);
  }

  return (
    <Sheet open={open} onOpenChange={changeOpen}>
      <SheetTrigger render={trigger} />
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={isMobile ? undefined : desktopDialogClass}
      >
        <SheetHeader>
          <SheetTitle>
            {destination.kind === "new"
              ? "Upload a Video"
              : `Upload ${destination.title} again`}
          </SheetTitle>
          <SheetDescription>
            1080p H.264 MP4 processes fastest. Up to 20 GB and 12 hours.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-3 p-4 pt-0">
          <div className="flex flex-col gap-1">
            <label htmlFor={fileId} className="text-sm font-medium">
              Video file
            </label>
            <Input
              ref={fileInput}
              id={fileId}
              type="file"
              accept="video/*"
              className="h-10 py-1.5"
              onChange={(event) => pickFile(event.target.files?.[0])}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
          </div>
          {destination.kind === "new" && projects.length > 1 && (
            <div className="flex flex-col gap-1">
              <label htmlFor={projectFieldId} className="text-sm font-medium">
                Project
              </label>
              <select
                id={projectFieldId}
                className={selectClass}
                value={chosenProject}
                onChange={(event) => setProjectId(event.target.value)}
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {destination.kind === "new" && (
            <div className="flex flex-col gap-1">
              <label htmlFor={titleId} className="text-sm font-medium">
                Video title
              </label>
              <Input
                id={titleId}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
          )}
          {noProjects && (
            <p className="text-sm text-muted-foreground">
              Create a Project first, then upload into it.
            </p>
          )}
          {error && (
            <p id={errorId} role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit">Start upload</Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

const phaseText: Record<UploadItem["phase"], (item: UploadItem) => string> = {
  waiting: () => "Waiting for the upload ahead of it",
  sending: ({ percent }) => `Sending, ${percent}%`,
  paused: () => "Paused while offline. It continues when you are back online.",
  sent: () => "Sent, and being processed.",
  failed: () => "This could not be sent. Check your connection and retry.",
  "cancel-failed": () => "Could not cancel. Check your connection and try Cancel again.",
  "too-late": () => "Already sent, so it is being processed.",
};

function UploadRow({ item }: { item: UploadItem }) {
  const active = item.phase === "sending" || item.phase === "paused";
  const cancellable = active || item.phase === "waiting" || item.phase === "cancel-failed";
  const finished = item.phase === "sent" || item.phase === "too-late";
  return (
    <li className="flex flex-col gap-1 rounded-md border p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 font-medium wrap-anywhere">{item.label}</span>
        <span className="flex shrink-0 gap-1">
          {item.phase === "failed" && (
            <Button
              size="sm"
              variant="outline"
              aria-label={`Retry upload of ${item.label}`}
              onClick={() => retryUpload(item.id)}
            >
              Retry
            </Button>
          )}
          {cancellable && (
            <Button
              size="sm"
              variant="outline"
              aria-label={`Cancel upload of ${item.label}`}
              onClick={() => void stopUpload(item.id)}
            >
              Cancel
            </Button>
          )}
          {(finished || item.phase === "failed") && (
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Dismiss ${item.label}`}
              onClick={() => dismissUpload(item.id)}
            >
              <X aria-hidden />
            </Button>
          )}
        </span>
      </div>
      {active && (
        <progress
          className="h-2 w-full accent-primary"
          aria-label={`Uploading ${item.label}`}
          max={100}
          value={item.percent}
        />
      )}
      <p className="text-sm text-muted-foreground">{phaseText[item.phase](item)}</p>
    </li>
  );
}

/** In the page flow, so it never covers content or focus on a phone. */
export function UploadList() {
  const uploads = useUploads();
  if (uploads.length === 0) return null;

  return (
    <section aria-label="Uploads" className="mb-4">
      <h2 className="mb-2 font-medium">Uploads</h2>
      <ul className="flex flex-col gap-2">
        {uploads.map((item) => (
          <UploadRow key={item.id} item={item} />
        ))}
      </ul>
    </section>
  );
}

/** Always present: a live region added along with its message may not be read. */
export function UploadAnnouncer() {
  // Only phase changes are announced: every percent would drown a screen reader.
  const announcement = useUploads()
    .map((item) =>
      item.phase === "sending" ? "" : `${item.label}: ${phaseText[item.phase](item)}`,
    )
    .filter(Boolean)
    .join(" ");

  return (
    <p role="status" className="sr-only">
      {announcement}
    </p>
  );
}
