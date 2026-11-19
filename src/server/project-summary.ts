import { projects } from "@/server/db/schema";

// Its own module: a non-function export from a server-function file would pull server code into the browser bundle.
export const projectSummary = {
  id: projects.id,
  name: projects.name,
  createdAt: projects.createdAt,
  completedAt: projects.completedAt,
  deleteAfter: projects.deleteAfter,
};
