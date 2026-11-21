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
import { useProjectStageMoves } from "@/components/project-stage-moves";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useIsMobile } from "@/hooks/use-mobile";
import { projectStages, stageLabels, type ProjectStage } from "@/lib/project-stage";
import {
  isPendingProject,
  useSetProjectComplete,
  type ProjectList,
  type ProjectSummary,
} from "@/lib/projects";
import { reviewBoard } from "@/lib/review-board";

const Board = createParts(reviewBoard, { root: "div", column: "ul", card: "article" });

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
  view = "board",
  onViewChange,
  completing,
  onCompletingChange,
}: {
  list: ProjectList;
  stage?: ProjectStage;
  onStageChange: (stage: ProjectStage | undefined) => void;
  /** `list` stacks the columns, as on a phone. */
  view?: "board" | "list";
  onViewChange: (view: "board" | "list" | undefined) => void;
  /** The Project whose Complete sheet is open, kept in the URL. */
  completing?: string;
  onCompletingChange: (projectId: string | undefined) => void;
}) {
  const help = useId();
  const [allDone, setAllDone] = useState(false);
  const { move, stageActions, feedback, setStatus, setFailure, setUndo } = useProjectStageMoves();
  const setComplete = useSetProjectComplete();
  // Order inside a column is local: the server stores only the Stage.
  const [order, setOrder] = useState<string[]>([]);
  const { projects } = list;
  const rank = (id: string) => {
    const index = order.indexOf(id);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  // On a phone, Projects that need someone come first in each Stage; an order set by a move still wins.
  const phone = useIsMobile();
  const attention = (id: string) =>
    phone &&
    needsAttention(
      projects.find((project) => project.id === id)!,
      list,
    )
      ? 1
      : 0;
  const lists: TransferLists = Object.fromEntries(
    projectStages.map((column) => [
      column,
      projects
        .filter((project) => project.stage === column)
        .map((project) => project.id)
        .sort((a, b) => rank(a) - rank(b) || attention(b) - attention(a)),
    ]),
  );
  const titles = Object.fromEntries(projects.map((project) => [project.id, project.name]));
  const locked = projects.filter((project) => !movable(project)).map((project) => project.id);
  const anyMovable = locked.length < projects.length;
  const shown = stage ? [stage] : projectStages;
  const needsYou = stage
    ? []
    : projects.filter((project) => !isPendingProject(project) && needsAttention(project, list));

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
      ...stageActions(project),
      ...(project.stage === "done" && list.member.role === "owner"
        ? [
            {
              id: "complete",
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
    <section aria-labelledby="board-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="board-heading" className="sr-only">
          Board
        </h2>
        <ToggleGroup
          aria-label="Show Stage"
          // Pills that scroll sideways on a phone, edge to edge with the page padding.
          className="gap-1.5 max-md:-mx-4 max-md:w-[calc(100%+2rem)] max-md:overflow-x-auto max-md:px-4 max-md:[scrollbar-width:none]"
          value={[stage ?? "all"]}
          onValueChange={(next: string[]) => {
            if (next[0]) onStageChange(next[0] === "all" ? undefined : (next[0] as ProjectStage));
          }}
        >
          {(["all", ...projectStages] as const).map((value) => (
            <ToggleGroupItem
              key={value}
              value={value}
              className="h-11 shrink-0 rounded-full bg-muted/60 px-4 data-pressed:bg-primary data-pressed:text-primary-foreground hover:data-pressed:bg-primary/90 sm:pointer-fine:h-9"
            >
              {value === "all" ? "All" : stageLabels[value]}{" "}
              <span className="tabular-nums opacity-70">
                {value === "all" ? projects.length : lists[value]!.length}
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ToggleGroup
          aria-label="Layout"
          variant="outline"
          className="hidden md:flex"
          value={[view]}
          onValueChange={(next: string[]) => {
            if (next[0]) onViewChange(next[0] === "list" ? "list" : undefined);
          }}
        >
          <ToggleGroupItem value="board" className="h-9">
            Board
          </ToggleGroupItem>
          <ToggleGroupItem value="list" className="h-9">
            List
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      {feedback}
      {needsYou.length > 0 && <NeedsYou projects={needsYou} list={list} />}
      {anyMovable && (
        // A phone moves Projects only from the More actions menu, which the ⋯ button already shows.
        <details className="text-meta max-md:hidden">
          <summary className="w-fit cursor-pointer py-3">How to move a Project</summary>
          <p id={help} className="mt-1">
            <span className="md:hidden">
              Open a Project's More actions menu and choose a Stage.
            </span>
            <span className="max-md:hidden">
              Drag a Project to another column to change its Stage, or use its More actions menu.
              With a keyboard, focus a card and press Space to pick it up, Left and Right to change
              column, Space to drop and Escape to cancel.
            </span>
          </p>
        </details>
      )}
      <Board.Root
        lists={lists}
        onListsChange={change}
        columns={stageLabels}
        titles={titles}
        locked={locked}
        className={
          stage || view === "list"
            ? "flex flex-col max-md:gap-6"
            : "grid gap-3 max-md:gap-6 md:grid-cols-2 xl:grid-cols-4"
        }
      >
        {(state) => {
          // A phone with every Stage shown lists empty Stages on one line and keeps Done short.
          const emptyStages = stage
            ? []
            : projectStages.filter((column) => !state.lists[column]?.length);
          return [
            ...shown.map((column) => (
              <section
                key={column}
                aria-labelledby={`stage-${column}`}
                // On a phone the Stages are plain sections of one list, not boxed columns.
                className={`flex min-w-0 flex-col gap-2 md:rounded-card md:bg-muted/40 md:p-2 ${emptyStages.includes(column) ? "max-md:hidden" : ""}`}
              >
                <h3
                  id={`stage-${column}`}
                  className="flex items-center gap-2 pt-1 text-sm font-semibold md:px-2"
                >
                  {stageLabels[column]}
                  <span className="font-normal text-muted-foreground">
                    {state.lists[column]?.length ?? 0}
                  </span>
                </h3>
                {!state.lists[column]?.length && (
                  <p className="text-sm text-muted-foreground md:px-2">No Projects</p>
                )}
                <Board.Column value={column} className="flex flex-col gap-2 md:min-h-16">
                  {(state.lists[column] ?? []).map((id, index) => {
                    const project = projects.find((row) => row.id === id);
                    return (
                      project && (
                        <li
                          key={id}
                          className={
                            column === "done" && !stage && !allDone && index >= DONE_SHOWN
                              ? "min-w-0 max-md:hidden"
                              : "min-w-0"
                          }
                        >
                          <ProjectCard
                            project={project}
                            list={list}
                            help={movable(project) ? help : undefined}
                            showStage={view === "list"}
                            actions={actions(project)}
                            completing={completing === project.id}
                            onCompletingChange={(open) =>
                              onCompletingChange(open ? project.id : undefined)
                            }
                          />
                        </li>
                      )
                    );
                  })}
                </Board.Column>
                {column === "done" &&
                  !stage &&
                  !allDone &&
                  (state.lists.done?.length ?? 0) > DONE_SHOWN && (
                    <button
                      type="button"
                      onClick={() => setAllDone(true)}
                      className="min-h-11 w-fit text-sm font-medium text-muted-foreground underline-offset-4 hover:underline md:hidden"
                    >
                      Show all {state.lists.done!.length} in Done
                    </button>
                  )}
              </section>
            )),
            emptyStages.length > 0 && (
              <p key="empty" className="text-sm text-muted-foreground md:hidden">
                No Projects in {emptyStages.map((column) => stageLabels[column]).join(", ")}
              </p>
            ),
          ];
        }}
      </Board.Root>
    </section>
  );
}

function ProjectCard({
  project,
  list,
  help,
  showStage,
  actions,
  completing,
  onCompletingChange,
}: {
  project: ProjectSummary;
  list: ProjectList;
  help?: string;
  /** A board column's heading already names the Stage; the list shows it on each card. */
  showStage: boolean;
  actions: Action[];
  completing: boolean;
  onCompletingChange: (open: boolean) => void;
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
      // A phone shows a compact row: a small thumbnail beside the name, status and meta.
      className="grid gap-2 rounded-card border bg-card p-4 text-sm select-none focus-visible:outline-2 data-grabbed:ring-2 data-grabbed:ring-ring max-md:grid-cols-[6rem_minmax(0,1fr)] max-md:gap-x-3 max-md:gap-y-0 max-md:p-3 sm:touch-none"
    >
      <div
        className={poster ? "relative max-md:row-span-4" : "relative max-md:row-span-4 md:hidden"}
      >
        <Poster key={poster} url={poster} />
        {!pending && (
          <Link
            to="/projects/$projectId"
            params={{ projectId: project.id }}
            tabIndex={-1}
            aria-hidden
            className="absolute inset-0 md:hidden"
          />
        )}
      </div>
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
        <ActionMenu
          label={`More actions for ${project.name}`}
          actions={actions}
          current={completing ? "complete" : undefined}
          onCurrentChange={(id) => onCompletingChange(id === "complete")}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {showStage && <StageBadge stage={project.stage} />}
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
      <div className="text-meta flex items-center justify-between gap-2">
        {project.openNotes > 0 && <span>{project.openNotes} to do</span>}
        <AvatarStack people={project.people} label="People with access" className="ml-auto" />
      </div>
    </Board.Card>
  );
}

/** Done Projects a phone shows before "Show all". */
const DONE_SHOWN = 5;

/** A phone's inbox above the board: the Projects that need someone, each one tap away. */
function NeedsYou({ projects, list }: { projects: ProjectSummary[]; list: ProjectList }) {
  return (
    <section aria-labelledby="needs-you" className="flex flex-col gap-2 md:hidden">
      <h3 id="needs-you" className="flex items-center gap-2 pt-1 text-sm font-semibold">
        Needs you <span className="font-normal text-muted-foreground">{projects.length}</span>
      </h3>
      <ul className="divide-y overflow-hidden rounded-card border bg-card">
        {projects.map((project) => {
          const poster =
            list.videos.find((video) => video.projectId === project.id && video.posterUrl)
              ?.posterUrl ?? null;
          const changes =
            project.stage === "editing" &&
            project.changesRequested &&
            project.latestRevision !== null;
          return (
            <li key={project.id}>
              <Link
                to="/projects/$projectId"
                params={{ projectId: project.id }}
                className="flex min-h-11 items-center gap-3 p-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              >
                <span className="w-16 shrink-0">
                  <Poster key={poster} url={poster} />
                </span>
                <span className="flex min-w-0 flex-col text-sm">
                  <span className="truncate font-semibold">{project.name}</span>
                  {changes ? (
                    <span className="font-medium text-stage-editing-foreground">
                      Changes requested · Rev {project.latestRevision}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Unread activity</span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Changes requested or unread activity: the Projects an Editor opens Home to find. */
function needsAttention(project: ProjectSummary, list: ProjectList) {
  return (
    (project.stage === "editing" && project.changesRequested) ||
    list.videos.some((video) => video.projectId === project.id && video.unread)
  );
}
