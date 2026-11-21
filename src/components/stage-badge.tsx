import { Badge } from "@/components/ui/badge";
import { stageLabels, type ProjectStage } from "@/lib/project-stage";
import { cn } from "@/lib/utils";

/** The tint and text color of each Stage. */
export const stageTone = {
  new: "bg-stage-new/12 text-stage-new-foreground",
  editing: "bg-stage-editing/12 text-stage-editing-foreground",
  in_review: "bg-stage-in-review/12 text-stage-in-review-foreground",
  done: "bg-stage-done/12 text-stage-done-foreground",
} satisfies Record<ProjectStage, string>;

export function ToneBadge({
  tone,
  children,
  className,
}: {
  tone: ProjectStage;
  children: string;
  className?: string;
}) {
  return (
    <Badge variant="secondary" className={cn(stageTone[tone], className)}>
      {children}
    </Badge>
  );
}

export function StageBadge({ stage, className }: { stage: ProjectStage; className?: string }) {
  return (
    <ToneBadge tone={stage} className={className}>
      {stageLabels[stage]}
    </ToneBadge>
  );
}
