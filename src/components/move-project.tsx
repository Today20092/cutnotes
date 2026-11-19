import { useQuery } from "@tanstack/react-query";
import { FolderInput } from "lucide-react";
import { useId, useState } from "react";
import { PendingButton } from "@/components/pending-button";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMoveProject } from "@/lib/folders";
import { projectListQuery } from "@/lib/projects";

/** Owners file a Project in a Folder, or take it out again. */
export function MoveProject({
  projectId,
  name,
  folderId,
  onMoved,
}: {
  projectId: string;
  name: string;
  folderId: string | null;
  onMoved: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState(folderId ?? "");
  const mobile = useIsMobile();
  const fieldId = useId();
  const folders = useQuery(projectListQuery).data?.folders ?? [];
  const move = useMoveProject();
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setChoice(folderId ?? "");
      }}
    >
      <SheetTrigger render={<Button variant="secondary" />}>
        <FolderInput aria-hidden /> Move to folder
      </SheetTrigger>
      <SheetContent side={mobile ? "bottom" : "right"}>
        <SheetHeader>
          <SheetTitle>Move {name} to a Folder</SheetTitle>
          <SheetDescription>
            People with access to the Folder can open this Project. Access given on the Project
            itself stays.
          </SheetDescription>
        </SheetHeader>
        <form
          className="flex flex-col gap-3 p-4 pt-0"
          onSubmit={(event) => {
            event.preventDefault();
            move.mutate(
              { projectId, folderId: choice || null },
              {
                onSuccess: () => {
                  setOpen(false);
                  const target = folders.find((folder) => folder.id === choice);
                  onMoved(target ? `${name} moved to ${target.name}` : `${name} has no Folder now`);
                },
              },
            );
          }}
        >
          <label htmlFor={fieldId}>Folder</label>
          <NativeSelect id={fieldId} value={choice} onChange={(e) => setChoice(e.target.value)}>
            <option value="">No folder</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </NativeSelect>
          {move.isError && <p role="alert">Could not move {name}. Please try again.</p>}
          <PendingButton type="submit" pending={move.isPending}>
            Move Project
          </PendingButton>
        </form>
      </SheetContent>
    </Sheet>
  );
}
