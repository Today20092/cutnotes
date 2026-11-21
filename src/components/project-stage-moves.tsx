import { useState } from "react";
import type { Action } from "@/components/action-menu";
import { Button } from "@/components/ui/button";
import { projectStages, stageLabels, type ProjectStage } from "@/lib/project-stage";
import { useSetProjectStage, type ProjectSummary } from "@/lib/projects";

type Move = { projectId: string; name: string; from: ProjectStage; to: ProjectStage };

export function useProjectStageMoves() {
  const setStage = useSetProjectStage();
  const [status, setStatus] = useState("");
  const [failure, setFailure] = useState("");
  const [undo, setUndo] = useState<Move | null>(null);

  function move({ projectId, name, from, to }: Move, isUndo = false) {
    setFailure("");
    setStage.mutate(
      { projectId, stage: to },
      {
        onSuccess: () => {
          setStatus(
            isUndo
              ? `${name} moved back to ${stageLabels[to]}`
              : `${name} moved to ${stageLabels[to]}`,
          );
          setUndo(isUndo ? null : { projectId, name, from, to });
        },
        onError: () => {
          setUndo(null);
          setFailure(`Could not move ${name}. It stays in ${stageLabels[from]}. Try again.`);
        },
      },
    );
  }

  function stageActions({
    id,
    name,
    stage,
  }: Pick<ProjectSummary, "id" | "name" | "stage">): Action[] {
    return projectStages
      .filter((to) => to !== stage)
      .map((to) => ({
        label: `Move to ${stageLabels[to]}`,
        onSelect: () => move({ projectId: id, name, from: stage, to }),
      }));
  }

  const feedback = (
    <div
      className={
        status || undo || failure ? "flex flex-wrap items-center gap-2 text-sm" : "contents"
      }
    >
      <p role="status" className={status ? "" : "sr-only"}>
        {status}
      </p>
      {undo && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => move({ ...undo, from: undo.to, to: undo.from }, true)}
        >
          Undo
        </Button>
      )}
      {failure && (
        <p role="alert" className="text-destructive wrap-anywhere">
          {failure}
        </p>
      )}
    </div>
  );

  return { move, stageActions, feedback, setStatus, setFailure, setUndo };
}
