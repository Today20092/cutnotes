import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStatusToast } from "@/components/project-parts";

/** Copies a page link; `feedback` shows the link to copy by hand when the clipboard refuses. */
export function useCopyPageLink(kind: "project" | "video", path: string) {
  const [status, setStatus] = useState("");
  const [fallback, setFallback] = useState("");
  useStatusToast(status);
  const copy = async () => {
    const url = `${location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      setStatus(`${kind === "project" ? "Project" : "Video"} link copied`);
    } catch {
      setFallback(url);
      setStatus("Select the link and copy it yourself.");
    }
  };
  const feedback = (
    <>
      {fallback && (
        <label className="flex flex-col gap-1 text-sm">
          Link to copy
          <Input readOnly value={fallback} onFocus={(event) => event.currentTarget.select()} />
        </label>
      )}
      <span role="status" className="sr-only">
        {status}
      </span>
    </>
  );
  return { copy, feedback };
}

export function CopyPageLink({ kind, path }: { kind: "project" | "video"; path: string }) {
  const { copy, feedback } = useCopyPageLink(kind, path);
  return (
    <div className="flex flex-col gap-2">
      <Button variant="secondary" onClick={copy}>
        Copy {kind} link
      </Button>
      {feedback}
    </div>
  );
}
