import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStatusToast } from "@/components/project-parts";

export function CopyPageLink({ kind, path }: { kind: "project" | "video"; path: string }) {
  const [status, setStatus] = useState("");
  const [fallback, setFallback] = useState("");
  useStatusToast(status);
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="secondary"
        onClick={async () => {
          const url = `${location.origin}${path}`;
          try {
            await navigator.clipboard.writeText(url);
            setStatus(`${kind === "project" ? "Project" : "Video"} link copied`);
          } catch {
            setFallback(url);
            setStatus("Select the link and copy it yourself.");
          }
        }}
      >
        Copy {kind} link
      </Button>
      {fallback && (
        <label className="flex flex-col gap-1 text-sm">
          Link to copy
          <Input readOnly value={fallback} onFocus={(event) => event.currentTarget.select()} />
        </label>
      )}
      <span role="status" className="sr-only">
        {status}
      </span>
    </div>
  );
}
