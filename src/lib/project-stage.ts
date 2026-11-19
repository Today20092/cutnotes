export const projectStages = ["new", "editing", "in_review", "done"] as const;
export type ProjectStage = (typeof projectStages)[number];

export const stageLabels: Record<ProjectStage, string> = {
  new: "New",
  editing: "Editing",
  in_review: "In review",
  done: "Done",
};
