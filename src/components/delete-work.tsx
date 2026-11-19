import { PendingButton } from "@/components/pending-button";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useDeleteWork } from "@/lib/projects";
import { useIsMobile } from "@/hooks/use-mobile";

export function DeleteWork({
  kind,
  id,
  name,
  onDeleted,
  startOpen = false,
  onClosed,
}: {
  kind: "Project" | "Video";
  id: string;
  name: string;
  onDeleted?: () => void;
  startOpen?: boolean;
  onClosed?: () => void;
}) {
  const [open, setOpen] = useState(startOpen);
  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) onClosed?.();
  }
  const remove = useDeleteWork(kind, id);
  const mobile = useIsMobile();
  return (
    <Sheet open={open} onOpenChange={changeOpen}>
      {!startOpen && (
        <SheetTrigger render={<Button variant="destructive" aria-label={`Delete ${name}`} />}>
          Delete
        </SheetTrigger>
      )}
      <SheetContent side={mobile ? "bottom" : "right"}>
        <SheetHeader>
          <SheetTitle>Delete {kind}?</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-3 p-4 pt-0">
          <p>
            {name} will disappear immediately and be permanently deleted. This cannot be undone.
          </p>
          {remove.isError && <p role="alert">Could not delete {name}. Please try again.</p>}
          <SheetClose render={<Button variant="outline" />}>Keep {kind}</SheetClose>
          <PendingButton
            variant="destructive"
            pending={remove.isPending}
            onClick={() => {
              // mutateAsync, not mutate callbacks: the refetch of a deleted Project unmounts this
              // component, and mutate's own callbacks are skipped once it is gone.
              remove.mutateAsync().then(
                () => {
                  changeOpen(false);
                  onDeleted?.();
                },
                () => undefined, // remove.isError shows the failure
              );
            }}
          >
            Delete {name} permanently
          </PendingButton>
        </div>
      </SheetContent>
    </Sheet>
  );
}
