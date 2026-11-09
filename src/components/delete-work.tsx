import { useState } from "react";
import { Trash2 } from "lucide-react";
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
  icon = false,
}: {
  kind: "Project" | "Video";
  id: string;
  name: string;
  onDeleted?: () => void;
  icon?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const remove = useDeleteWork(kind, id);
  const mobile = useIsMobile();
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant={icon ? "ghost" : "destructive"}
            size={icon ? "icon" : "default"}
            aria-label={`Delete ${name}`}
          />
        }
      >
        {icon ? <Trash2 aria-hidden /> : "Delete"}
      </SheetTrigger>
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
          <Button
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => {
              remove.mutate(undefined, {
                onSuccess: () => {
                  setOpen(false);
                  onDeleted?.();
                },
              });
            }}
          >
            Delete {name} permanently
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
