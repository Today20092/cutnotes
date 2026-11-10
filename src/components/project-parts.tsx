import { Clapperboard, Pencil } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { Fragment } from "react";
import { toastManager } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import type { VideoSummary } from "@/lib/projects";
import type { Role } from "@/server/db/schema";

const MAX_NAME_LENGTH = 120;

export const canWrite = (role: Role) => role !== "viewer";

export const selectClass =
  "h-10 rounded-lg border border-input bg-background px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring md:text-sm";

// The first view keeps focus where the browser put it.
let hasShownAView = false;

/** The view's one h1. On a new view it takes focus and sets the document title. */
/** Where this view sits. On phones the current page is left to the h1 directly below. */
export function PageBreadcrumb({
  trail,
  current,
}: {
  trail: { label: string; link: ReactElement }[];
  current: string;
}) {
  return (
    <Breadcrumb className="flex min-h-11 items-center pr-12">
      <BreadcrumbList>
        {trail.map(({ label, link }, index) => (
          <Fragment key={label}>
            <BreadcrumbItem>
              <BreadcrumbLink
                className="inline-flex min-h-11 items-center wrap-anywhere sm:min-h-0"
                render={link}
              >
                {label}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator
              className={index === trail.length - 1 ? "hidden sm:list-item" : undefined}
            />
          </Fragment>
        ))}
        <BreadcrumbItem className="hidden sm:inline-flex">
          <BreadcrumbPage className="wrap-anywhere">{current}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export const backLinkClass =
  "inline-flex min-h-11 w-fit items-center gap-1 text-sm underline-offset-4 hover:underline";

export function PageHeading({ title, children }: { title: string; children?: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (hasShownAView) heading.current?.focus();
    hasShownAView = true;
  }, []);
  useEffect(() => {
    document.title = `${title} · Cutnotes`;
  }, [title]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h1 ref={heading} tabIndex={-1} className="min-w-0 text-xl font-semibold wrap-anywhere">
        {title}
      </h1>
      {children && <div className="flex max-w-full flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function ProjectNameSheet({
  trigger,
  title,
  submitLabel,
  initialName = "",
  fieldLabel = "Project name",
  emptyMessage = "Enter a name for the Project.",
  onSubmit,
  startOpen = false,
  onClosed,
}: {
  trigger?: ReactElement;
  startOpen?: boolean;
  onClosed?: () => void;
  title: string;
  submitLabel: string;
  initialName?: string;
  fieldLabel?: string;
  emptyMessage?: string;
  onSubmit: (name: string) => void;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(startOpen);
  const [name, setName] = useState(initialName);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const errorId = useId();

  function changeOpen(next: boolean) {
    setOpen(next);
    if (next) {
      setName(initialName);
      setError("");
    } else onClosed?.();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > MAX_NAME_LENGTH) {
      setError(trimmed ? `Keep the name to ${MAX_NAME_LENGTH} characters.` : emptyMessage);
      input.current?.focus();
      return;
    }
    setOpen(false);
    onClosed?.();
    onSubmit(trimmed);
  }

  return (
    <Sheet open={open} onOpenChange={changeOpen}>
      {trigger && <SheetTrigger render={trigger} />}
      <SheetContent side={isMobile ? "bottom" : "right"}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-3 p-4 pt-0">
          <div className="flex flex-col gap-1">
            <label htmlFor={inputId} className="text-sm font-medium">
              {fieldLabel}
            </label>
            <Input
              ref={input}
              id={inputId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
            {error && (
              <p id={errorId} className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <Button type="submit">{submitLabel}</Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function RenameProjectButton({
  name,
  onRename,
  labeled = false,
}: {
  name: string;
  onRename: (name: string) => void;
  labeled?: boolean;
}) {
  return (
    <ProjectNameSheet
      title="Rename Project"
      submitLabel="Save name"
      initialName={name}
      onSubmit={onRename}
      trigger={
        <Button
          variant={labeled ? "secondary" : "ghost"}
          size={labeled ? "default" : "icon"}
          aria-label={`Rename ${name}`}
        >
          <Pencil aria-hidden />
          {labeled && " Rename"}
        </Button>
      }
    />
  );
}

/** Shows a confirmation that everyone can see; the status region still speaks it. */
export function useStatusToast(status: string) {
  useEffect(() => {
    if (status) toastManager.add({ title: status });
  }, [status]);
}

export const unreadFirst = <Row extends { unread: boolean }>(videos: Row[]) =>
  [...videos].sort((a, b) => Number(b.unread) - Number(a.unread));

/** A two-step control for an action that cannot be undone. */
export function ConfirmButton({
  label,
  text,
  disabled,
  onConfirm,
}: {
  label: string;
  text: string;
  disabled?: boolean;
  onConfirm: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const first = useRef<HTMLButtonElement>(null);
  const confirm = useRef<HTMLButtonElement>(null);
  const was = useRef(false);
  // The control that had focus is replaced, so focus moves with the swap.
  useEffect(() => {
    if (confirming) confirm.current?.focus();
    else if (was.current) first.current?.focus();
    was.current = confirming;
  }, [confirming]);
  if (!confirming)
    return (
      <Button
        ref={first}
        type="button"
        variant="ghost"
        aria-label={label}
        disabled={disabled}
        onClick={() => setConfirming(true)}
      >
        {text}
      </Button>
    );
  return (
    <span className="flex flex-wrap gap-2">
      <Button
        ref={confirm}
        type="button"
        variant="destructive"
        aria-label={`${label} now`}
        disabled={disabled}
        onClick={onConfirm}
      >
        {text}?
      </Button>
      <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
        Keep
      </Button>
    </span>
  );
}

/** Spoken confirmation of a write, and a visible message when one fails. */
export function WriteFeedback({ status, failure }: { status: string; failure: string }) {
  useStatusToast(status);
  return (
    <>
      <p role="status" className="sr-only">
        {status}
      </p>
      {failure && (
        <p role="alert" className="text-sm text-destructive wrap-anywhere">
          {failure}
        </p>
      )}
    </>
  );
}

export const statusLabels = { review: "Review", rework: "Rework", done: "Done" };

function formatUpdated(timestamp: number) {
  const minutes = Math.floor((Date.now() - timestamp) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function revisionProgress(video: VideoSummary) {
  switch (video.latestRevisionState) {
    case "uploading":
      return { text: "Uploading…", failed: false };
    case "processing":
      return { text: "Processing. It can be played once this finishes.", failed: false };
    case "errored":
      if (video.latestRevisionError === "too-long") {
        return { text: "Over the 12-hour limit. Upload a shorter cut.", failed: true };
      }
      return {
        text: video.latestRevisionError?.startsWith("upload-")
          ? "The upload failed. Upload it again."
          : "Processing failed. Upload it again.",
        failed: true,
      };
    default:
      return undefined;
  }
}

function Poster({ url }: { url: string | null }) {
  const [broken, setBroken] = useState(false);
  if (url && !broken) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
        className="aspect-video w-full rounded-lg bg-muted object-cover"
      />
    );
  }
  return (
    <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-muted">
      <Clapperboard className="size-8 text-muted-foreground" aria-hidden />
    </div>
  );
}

export function VideoCard({
  video,
  showStatus = true,
}: {
  video: VideoSummary;
  showStatus?: boolean;
}) {
  const progress = revisionProgress(video);
  const revision =
    video.latestRevision === null ? "No Revision yet" : `Revision ${video.latestRevision}`;
  return (
    <>
      <div className="w-28 shrink-0 sm:w-full">
        <Poster key={video.posterUrl} url={video.posterUrl} />
      </div>
      <div className="flex min-w-0 flex-1 items-start justify-between gap-2 sm:mt-2">
        <div className="min-w-0 wrap-anywhere">
          <div className="font-medium">{video.title}</div>
          {video.unread && (
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <span aria-hidden className="size-2 rounded-full bg-primary" />
              Unread activity
            </span>
          )}
          <div className="text-sm text-muted-foreground">
            {video.projectName} · {revision} · {formatUpdated(video.updatedAt)}
          </div>
          {progress && (
            <div className={progress.failed ? "text-sm text-destructive" : "text-sm"}>
              {progress.text}
            </div>
          )}
        </div>
        {showStatus && (
          <Badge variant="secondary" className="shrink-0">
            {statusLabels[video.status]}
          </Badge>
        )}
      </div>
    </>
  );
}

export const videoGridClass = "grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 xl:grid-cols-3";

export function VideoGridSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-4">
      <Skeleton className="h-7 w-40" />
      <div className={videoGridClass}>
        {[0, 1, 2].map((key) => (
          <div key={key} className="flex flex-col gap-2">
            <Skeleton className="aspect-video w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
