import { and, eq, sql, type SQL } from "drizzle-orm";
import { openProject } from "@/server/access";
import type { Db } from "@/server/db";
import { projects, type ProjectStage } from "@/server/db/schema";

/**
 * Moves an open Project to `stage`. `allowed` is the caller's Access, re-checked in the
 * statement. Not a server function: callers add it to their own batch.
 */
export const moveStage = (
  db: Db,
  projectId: string | SQL,
  stage: ProjectStage,
  allowed: SQL | undefined,
  now = Date.now(),
) =>
  db
    .update(projects)
    .set({ stage, updatedAt: now })
    .where(
      and(
        eq(projects.id, sql`${projectId}`),
        openProject(projects.id),
        sql`${projects.stage} <> ${stage}`,
        allowed,
      ),
    );

/** A Project nobody has started moves to Editing once someone who can upload is on it. */
export const startEditing = (db: Db, projectId: string | SQL, allowed: SQL) =>
  moveStage(db, projectId, "editing", and(eq(projects.stage, "new"), allowed));
