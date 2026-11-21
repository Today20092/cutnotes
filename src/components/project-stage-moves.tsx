import { useState } from "react";
import type { Action } from "@/components/action-menu";
import { toast } from "@/components/ui/toast";
import { projectStages, stageLabels, type ProjectStage } from "@/lib/project-stage";
import { useSetProjectStage, type ProjectSummary } from "@/lib/projects";
import { COMMENT_UNDO_MS } from "@/lib/review";

type Move = { projectId: string; name: string; from: ProjectStage; to: ProjectStage };

export function dismissStageUndo(projectId: string) {
  toast.dismiss(`stage-undo-${projectId}`);
}

export function useProjectStageMoves() {
  const setStage = useSetProjectStage();
  const [status, setStatusText] = useState("");
  const [failure, setFailure] = useState("");

  function setStatus(message: string, moveToUndo?: Move) {
    setStatusText(message);
    toast({
      title: message,
      ...(moveToUndo && {
        id: `stage-undo-${moveToUndo.projectId}`,
        duration: COMMENT_UNDO_MS,
        action: { label: "Undo", onAction: () => move(moveToUndo, true) },
      }),
    });
  }

  function move({ projectId, name, from, to }: Move, isUndo = false) {
    dismissStageUndo(projectId);
    setFailure("");
    setStage.mutate(
      { projectId, stage: to },
      {
        onSuccess: () =>
          isUndo
            ? setStatus(`${name} moved back to ${stageLabels[to]}`)
            : setStatus(`${name} moved to ${stageLabels[to]}`, {
                projectId,
                name,
                from: to,
                to: from,
              }),
        onError: () =>
          setFailure(`Could not move ${name}. It stays in ${stageLabels[from]}. Try again.`),
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
    <>
      <p role="status" className="sr-only">
        {status}
      </p>
      {failure && (
        <p role="alert" className="text-sm text-destructive wrap-anywhere">
          {failure}
        </p>
      )}
    </>
  );

  return { move, stageActions, feedback, setStatus, setFailure };
}
