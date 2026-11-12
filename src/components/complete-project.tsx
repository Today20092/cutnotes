import { Archive } from "lucide-react";
import { Banner, BannerContent, BannerDescription, BannerAction } from "@/components/ui/banner";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";

const DAY_MS = 24 * 60 * 60 * 1000;

function countdown(deleteAfter: number) {
  const days = Math.ceil((deleteAfter - Date.now()) / DAY_MS);
  if (days <= 0) return "will be permanently deleted within the hour";
  const on = new Date(deleteAfter).toLocaleDateString(undefined, { dateStyle: "long" });
  return `will be permanently deleted in ${days} ${days === 1 ? "day" : "days"}, on ${on}`;
}

export function CompleteBanner({
  deleteAfter,
  action,
}: {
  deleteAfter: number;
  action?: ReactNode;
}) {
  return (
    <Banner
      variant="warning"
      role="region"
      aria-label="Complete Project"
      className="flex-wrap rounded-lg border"
    >
      <Archive aria-hidden />
      <BannerContent>
        <BannerDescription className="text-foreground">
          This Project is Complete and {countdown(deleteAfter)}. It can be watched, but not changed.
        </BannerDescription>
      </BannerContent>
      {action && <BannerAction>{action}</BannerAction>}
    </Banner>
  );
}

export function CompleteProject({ name, onComplete }: { name: string; onComplete: () => void }) {
  const [open, setOpen] = useState(false);
  const mobile = useIsMobile();
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="secondary" aria-label={`Complete ${name}`} />}>
        Complete
      </SheetTrigger>
      <SheetContent side={mobile ? "bottom" : "right"}>
        <SheetHeader>
          <SheetTitle>Complete Project?</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-3 p-4 pt-0">
          <p>
            {name} becomes read-only, its Share Links stop working, and it will be permanently
            deleted in 14 days unless an Owner reopens it.
          </p>
          <SheetClose render={<Button variant="outline" />}>Keep open</SheetClose>
          <Button
            onClick={() => {
              setOpen(false);
              onComplete();
            }}
          >
            Complete {name}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
