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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import type { VideoSummary } from "@/lib/projects";
import type { Role } from "@/server/db/schema";

const MAX_NAME_LENGTH = 120;

export const canWrite = (role: Role) => role !== "viewer";

// The first view keeps focus where the browser put it.
let hasShownAView = false;

/** The view's one h1. On a new view it takes focus and sets the document title. */
export function PageHeading({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
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
      <h1
        ref={heading}
        tabIndex={-1}
        className="min-w-0 text-xl font-semibold wrap-anywhere"
      >
        {title}
      </h1>
      {children && <div className="flex shrink-0 gap-2">{children}</div>}
    </div>
  );
}

export function ProjectNameSheet({
  trigger,
  title,
  submitLabel,
  initialName = "",
  onSubmit,
}: {
  trigger: ReactElement;
  title: string;
  submitLabel: string;
  initialName?: string;
  onSubmit: (name: string) => void;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
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
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > MAX_NAME_LENGTH) {
      setError(
        trimmed
          ? `Keep the name to ${MAX_NAME_LENGTH} characters.`
          : "Enter a name for the Project.",
      );
      input.current?.focus();
      return;
    }
    setOpen(false);
    onSubmit(trimmed);
  }

  return (
    <Sheet open={open} onOpenChange={changeOpen}>
      <SheetTrigger render={trigger} />
      <SheetContent side={isMobile ? "bottom" : "right"}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-3 p-4 pt-0">
          <div className="flex flex-col gap-1">
            <label htmlFor={inputId} className="text-sm font-medium">
              Project name
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
}: {
  name: string;
  onRename: (name: string) => void;
}) {
  return (
    <ProjectNameSheet
      title="Rename Project"
      submitLabel="Save name"
      initialName={name}
      onSubmit={onRename}
      trigger={
        <Button variant="outline" size="icon" aria-label={`Rename ${name}`}>
          <Pencil aria-hidden />
        </Button>
      }
    />
  );
}

/** Spoken confirmation of a write, and a visible message when one fails. */
export function WriteFeedback({
  status,
  failure,
}: {
  status: string;
  failure: string;
}) {
  return (
    <>
      <p role="status" className="sr-only">
        {status}
      </p>
      {failure && (
        <p
          role="alert"
          className="rounded-md border border-destructive p-3 text-sm wrap-anywhere"
        >
          {failure}
        </p>
      )}
    </>
  );
}

const statusLabels = { review: "Review", rework: "Rework", done: "Done" };

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

export function VideoCard({ video }: { video: VideoSummary }) {
  const revision =
    video.latestRevision === null
      ? "No Revision yet"
      : `Revision ${video.latestRevision}`;
  return (
    <>
      <div className="flex aspect-video w-full items-center justify-center rounded-md border bg-muted">
        <Clapperboard className="size-8 text-muted-foreground" aria-hidden />
      </div>
      <div className="mt-2 flex items-start justify-between gap-2">
        <div className="min-w-0 wrap-anywhere">
          <div className="font-medium">{video.title}</div>
          <div className="text-sm text-muted-foreground">
            {video.projectName} · {revision} · {formatUpdated(video.updatedAt)}
          </div>
        </div>
        <span className="shrink-0 rounded-md border border-foreground px-2 py-0.5 text-xs font-medium">
          {statusLabels[video.status]}
        </span>
      </div>
    </>
  );
}

export const videoGridClass =
  "grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 xl:grid-cols-3";

export function VideoGridSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="flex flex-col gap-4"
    >
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
