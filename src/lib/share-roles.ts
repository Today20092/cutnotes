import type { AccessRole, ProjectRole } from "@/server/db/schema";

/** The three roles an Owner can give on a Project, with what each one allows. */
export const shareRoles: { role: ProjectRole; label: string; description: string }[] = [
  {
    role: "viewer",
    label: "Reviewer",
    description: "Can watch videos and comment. Can't upload or change anything.",
  },
  {
    role: "uploader",
    label: "Uploader",
    description:
      "Can add videos and new versions of their own videos, and comment. Can't change status.",
  },
  {
    role: "editor",
    label: "Editor",
    description: "Can upload, rename, change status and resolve comments.",
  },
];

export const roleLabel = (role: AccessRole) =>
  role === "owner" ? "Owner" : (shareRoles.find((choice) => choice.role === role)?.label ?? role);
