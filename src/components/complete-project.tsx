import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";

const DAY_MS = 24 * 60 * 60 * 1000;

function countdown(deleteAfter: number) {
  const days = Math.ceil((deleteAfter - Date.now()) / DAY_MS);
  if (days <= 0) return "will be permanently deleted within the hour";
  const on = new Date(deleteAfter).toLocaleDateString(undefined, { dateStyle: "long" });
  return `will be permanently deleted in ${days} ${days === 1 ? "day" : "days"}, on ${on}`;
}

export function CompleteBanner({ deleteAfter, action }: { deleteAfter: number; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-foreground p-3">
      <p>This Project is Complete and {countdown(deleteAfter)}. It can be watched, but not changed.</p>
      {action}
    </div>
  );
}

export function CompleteProject({ name, onComplete }: { name: string; onComplete: () => void }) {
  const [open, setOpen] = useState(false);
  const mobile = useIsMobile();
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="outline" aria-label={`Complete ${name}`} />}>Complete</SheetTrigger>
      <SheetContent side={mobile ? "bottom" : "right"}>
        <SheetHeader><SheetTitle>Complete Project?</SheetTitle></SheetHeader>
        <div className="flex flex-col gap-3 p-4 pt-0">
          <p>{name} becomes read-only, its Share Links stop working, and it will be permanently deleted in 14 days unless an Owner reopens it.</p>
          <SheetClose render={<Button variant="outline" />}>Keep open</SheetClose>
          <Button onClick={() => { setOpen(false); onComplete(); }}>Complete {name}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
