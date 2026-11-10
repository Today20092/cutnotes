import { useId, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { markerRates, premiereMarkers } from "@/lib/marker-export";
import type { Comment } from "@/server/comment-rules";

export function ExportMarkers({
  title,
  revision,
  comments,
  frameRate,
  durationMs,
}: {
  title: string;
  revision: number;
  comments: Comment[];
  frameRate: number | null;
  durationMs: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [rateLabel, setRateLabel] = useState<string>(
    () =>
      markerRates.find(
        (r) => Math.abs((r.ntsc ? (r.base * 1000) / 1001 : r.base) - (frameRate ?? 0)) < 0.02,
      )?.label ?? "",
  );
  const [start, setStart] = useState("00:00:00:00");
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const id = useId();
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="secondary" />}>
        <Download data-icon="inline-start" aria-hidden />
        Export markers
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Export Premiere markers</SheetTitle>
          <SheetDescription>
            Revision {revision}. Downloads a Final Cut Pro 7 XML sequence containing comment
            markers.
          </SheetDescription>
        </SheetHeader>
        <form
          className="flex flex-col gap-4 p-4 pt-0"
          onSubmit={(event) => {
            event.preventDefault();
            try {
              const rate = markerRates.find((r) => r.label === rateLabel);
              if (!rate) throw new Error("Choose the frame rate of your edit.");
              const content = premiereMarkers({
                title,
                revision,
                comments,
                rate,
                startTimecode: start,
                unresolvedOnly: filter === "unresolved",
                durationMs: durationMs ?? 0,
              });
              const url = URL.createObjectURL(
                new Blob([content], { type: "application/xml;charset=utf-8" }),
              );
              const link = document.createElement("a");
              link.href = url;
              link.download = `${title.replace(/[^a-z0-9_-]/gi, "-")}-r${revision}-markers.xml`;
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
              setError("");
              setOpen(false);
            } catch (problem) {
              setError(problem instanceof Error ? problem.message : "Could not export markers.");
            }
          }}
        >
          <label htmlFor={`${id}-filter`} className="flex flex-col gap-1 text-sm font-medium">
            Comments
            <NativeSelect
              id={`${id}-filter`}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All comments</option>
              <option value="unresolved">Unresolved only</option>
            </NativeSelect>
          </label>
          <label htmlFor={`${id}-rate`} className="flex flex-col gap-1 text-sm font-medium">
            Edit frame rate
            <NativeSelect
              id={`${id}-rate`}
              value={rateLabel}
              onChange={(e) => setRateLabel(e.target.value)}
            >
              <option value="" disabled>
                Choose frame rate
              </option>
              {markerRates.map((r) => (
                <option key={r.label} value={r.label}>
                  {r.label} fps
                </option>
              ))}
            </NativeSelect>
          </label>
          <label htmlFor={`${id}-start`} className="flex flex-col gap-1 text-sm font-medium">
            Sequence start timecode (non-drop)
            <Input
              id={`${id}-start`}
              value={start}
              onChange={(e) => setStart(e.target.value)}
              placeholder="00:00:00:00"
              aria-describedby={`${id}-help`}
            />
          </label>
          <p id={`${id}-help`} className="text-sm text-muted-foreground">
            Match your edit’s frame rate and start timecode. This export uses non-drop timecode.
            Import the XML into Premiere with File → Import. It creates a separate marker sequence;
            it does not modify your existing edit. Drawings are noted as text, not embedded.
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={!comments.length}>
            <Download data-icon="inline-start" aria-hidden />
            Download XML
          </Button>
          {!comments.length && (
            <p className="text-sm text-muted-foreground">
              There are no comments on this revision yet.
            </p>
          )}
        </form>
      </SheetContent>
    </Sheet>
  );
}
