import { createParts } from "@ui-sdk/react/primitive";
import type { TransferLists } from "@ui-sdk/core";
import { Link } from "@tanstack/react-router";
import { useId, useState } from "react";
import { ActionMenu, type Action } from "@/components/action-menu";
import { CompleteProject } from "@/components/complete-project";
import { AvatarStack } from "@/components/people";
import { canWrite, Poster } from "@/components/project-parts";
import { StageBadge } from "@/components/stage-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { projectStages, stageLabels, type ProjectStage } from "@/lib/project-stage";
import {
  isPendingProject,
  useSetProjectComplete,
  useSetProjectStage,
  type ProjectList,
  type ProjectSummary,
} from "@/lib/projects";
import { reviewBoard } from "@/lib/review-board";

const Board = createParts(reviewBoard, { root: "div", column: "ul", card: "article" });

type Move = { projectId: string; name: string; from: ProjectStage; to: ProjectStage };

/** Owners and the Project's Editors move an open Project; everyone else reads the board. */
const movable = (project: ProjectSummary) =>
  canWrite(project.role) && project.completedAt === null && !isPendingProject(project);

/**
 * Projects in New, Editing, In review and Done columns. Moving a card, by drag, keyboard
 * or its menu, sets the Project's Stage. `stage` shows one column, as on a phone.
 */
export function StageBoard({
  list,
  stage,
  onStageChange,
}: {
  list: ProjectList;
  stage?: ProjectStage;
  onStageChange: (stage: ProjectStage | undefined) => void;
}) {
  const help = useId();
  const setStage = useSetProjectStage();
  const setComplete = useSetProjectComplete();
  // Order inside a column is local: the server stores only the Stage.
  const [order, setOrder] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [failure, setFailure] = useState("");
  const [undo, setUndo] = useState<Move | null>(null);
  const { projects } = list;
  const rank = (id: string) => {
    const index = order.indexOf(id);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  const lists: TransferLists = Object.fromEntries(
    projectStages.map((column) => [
      column,
      projects
        .filter((project) => project.stage === column)
        .map((project) => project.id)
        .sort((a, b) => rank(a) - rank(b)),
    ]),
  );
  const titles = Object.fromEntries(projects.map((project) => [project.id, project.name]));
  const locked = projects.filter((project) => !movable(project)).map((project) => project.id);
  const anyMovable = locked.length < projects.length;
  const shown = stage ? [stage] : projectStages;

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

  function change(next: TransferLists) {
    setOrder(projectStages.flatMap((column) => next[column] ?? []));
    for (const column of projectStages)
      for (const id of next[column] ?? []) {
        const project = projects.find((row) => row.id === id);
        if (project && project.stage !== column)
          move({ projectId: id, name: project.name, from: project.stage, to: column });
      }
  }

  function complete(project: ProjectSummary) {
    setFailure("");
    setUndo(null);
    setComplete.mutate(
      { projectId: project.id, complete: true },
      {
        onSuccess: () => setStatus(`${project.name} is Complete`),
        onError: () =>
          setFailure(`Could not Complete ${project.name}. Nothing changed. Try again.`),
      },
    );
  }

  function actions(project: ProjectSummary): Action[] {
    if (!movable(project)) return [];
    return [
      ...projectStages
        .filter((to) => to !== project.stage)
        .map((to) => ({
          label: `Move to ${stageLabels[to]}`,
          onSelect: () =>
            move({ projectId: project.id, name: project.name, from: project.stage, to }),
        })),
      ...(project.stage === "done" && list.member.role === "owner"
        ? [
            {
              label: "Complete… (deleted in 14 days)",
              sheet: (onClosed: () => void) => (
                <CompleteProject
                  name={project.name}
                  onComplete={() => complete(project)}
                  startOpen
                  onClosed={onClosed}
                />
              ),
            },
          ]
        : []),
    ];
  }

  return (
    <section aria-labelledby="board-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="board-heading" className="text-lg font-semibold">
          Board
        </h2>
        <ToggleGroup
          aria-label="Show Stage"
          variant="outline"
          className="flex-wrap"
          value={[stage ?? "all"]}
          onValueChange={(next: string[]) => {
            if (next[0]) onStageChange(next[0] === "all" ? undefined : (next[0] as ProjectStage));
          }}
        >
          {(["all", ...projectStages] as const).map((value) => (
            <ToggleGroupItem key={value} value={value} className="h-11 sm:h-9">
              {value === "all" ? "All" : stageLabels[value]}{" "}
              {value === "all" ? projects.length : lists[value]!.length}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="flex min-h-11 flex-wrap items-center gap-2 text-sm">
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
      {anyMovable && (
        <p id={help} className="text-sm text-muted-foreground">
          Drag a Project to another column to change its Stage, or use its More actions menu. With a
          keyboard, focus a card and press Space to pick it up, Left and Right to change column,
          Space to drop and Escape to cancel.
        </p>
      )}
      <Board.Root
        lists={lists}
        onListsChange={change}
        columns={stageLabels}
        titles={titles}
        locked={locked}
        className={stage ? "flex flex-col" : "grid gap-3 md:grid-cols-2 xl:grid-cols-4"}
      >
        {(state) =>
          shown.map((column) => (
            <section
              key={column}
              aria-labelledby={`stage-${column}`}
              className="flex min-w-0 flex-col gap-2 rounded-xl border p-2"
            >
              <h3
                id={`stage-${column}`}
                className="flex items-center gap-2 px-1 text-sm font-semibold"
              >
                {stageLabels[column]}
                <span className="font-normal text-muted-foreground">
                  {state.lists[column]?.length ?? 0}
                </span>
              </h3>
              <Board.Column value={column} className="flex min-h-16 flex-col gap-2">
                {(state.lists[column] ?? []).map((id) => {
                  const project = projects.find((row) => row.id === id);
                  return (
                    project && (
                      <li key={id} className="min-w-0">
                        <ProjectCard
                          project={project}
                          list={list}
                          help={movable(project) ? help : undefined}
                          actions={actions(project)}
                        />
                      </li>
                    )
                  );
                })}
              </Board.Column>
            </section>
          ))
        }
      </Board.Root>
    </section>
  );
}

function ProjectCard({
  project,
  list,
  help,
  actions,
}: {
  project: ProjectSummary;
  list: ProjectList;
  help?: string;
  actions: Action[];
}) {
  const videos = list.videos.filter((video) => video.projectId === project.id);
  const poster = videos.find((video) => video.posterUrl)?.posterUrl ?? null;
  const unread = videos.some((video) => video.unread);
  const pending = isPendingProject(project);
  return (
    <Board.Card
      value={project.id}
      aria-label={`${project.name}, ${stageLabels[project.stage]}`}
      aria-describedby={help}
      className="flex flex-col gap-2 rounded-xl border bg-card p-3 text-sm select-none focus-visible:outline-2 data-grabbed:ring-2 data-grabbed:ring-ring sm:touch-none"
    >
      <Poster key={poster} url={poster} />
      <div className="flex items-start justify-between gap-2">
        {pending ? (
          <span className="min-w-0 py-2 font-semibold wrap-anywhere">{project.name}</span>
        ) : (
          <Link
            to="/projects/$projectId"
            params={{ projectId: project.id }}
            className="inline-flex min-h-11 min-w-0 items-center rounded font-semibold wrap-anywhere underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
          >
            {project.name}
          </Link>
        )}
        <ActionMenu label={`More actions for ${project.name}`} actions={actions} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StageBadge stage={project.stage} />
        {project.completedAt !== null && <Badge variant="secondary">Complete</Badge>}
        {unread && (
          <span className="flex items-center gap-1.5 font-semibold">
            <span aria-hidden className="size-2 rounded-full bg-primary" />
            Unread activity
          </span>
        )}
      </div>
      {project.stage === "editing" &&
        project.changesRequested &&
        project.latestRevision !== null && (
          <p className="font-medium text-stage-editing-foreground">
            Changes requested · Rev {project.latestRevision}
          </p>
        )}
      <div className="flex items-center justify-between gap-2 text-muted-foreground">
        <span>
          {project.openNotes} open {project.openNotes === 1 ? "note" : "notes"}
        </span>
        <AvatarStack people={project.people} label="People with access" />
      </div>
    </Board.Card>
  );
}
