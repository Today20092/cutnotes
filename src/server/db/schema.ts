import { sql } from "drizzle-orm";
// Relative path: drizzle-kit loads this file without the "@/" alias.
import { videoStatuses, type VideoStatus } from "../../lib/video-status";
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const roles = ["viewer", "editor", "owner"] as const;
export type Role = (typeof roles)[number];

export const members = sqliteTable("members", {
  id: text("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  displayName: text("display_name").notNull(),
  role: text("role", { enum: roles }).notNull(),
  createdAt: integer("created_at").notNull(),
  removedAt: integer("removed_at"),
});

export type Member = typeof members.$inferSelect;

export const invites = sqliteTable("invites", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  role: text("role", { enum: roles }).notNull(),
  createdBy: text("created_by")
    .notNull()
    .references(() => members.id, { onDelete: "cascade" }),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
  usedAt: integer("used_at"),
  usedBy: text("used_by").references(() => members.id, { onDelete: "cascade" }),
  revokedAt: integer("revoked_at"),
  projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
  note: text("note"),
});

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => members.id),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    completedAt: integer("completed_at"),
    deleteAfter: integer("delete_after"),
    deletedAt: integer("deleted_at"),
  },
  (table) => [index("projects_delete_after_idx").on(table.deleteAfter)],
);

export type Project = typeof projects.$inferSelect;

export const projectRoles = ["viewer", "editor"] as const;
export type ProjectRole = (typeof projectRoles)[number];

export const projectMembers = sqliteTable(
  "project_members",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    role: text("role", { enum: projectRoles }).notNull(),
    addedBy: text("added_by")
      .notNull()
      .references(() => members.id),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.memberId] }),
    index("project_members_member_idx").on(table.memberId),
  ],
);

export { videoStatuses, type VideoStatus };

export const videos = sqliteTable(
  "videos",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: text("status", { enum: videoStatuses }).notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => members.id),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    deletedAt: integer("deleted_at"),
  },
  (table) => [index("videos_project_id_idx").on(table.projectId)],
);

export const revisionStates = ["uploading", "processing", "ready", "errored"] as const;
export type RevisionState = (typeof revisionStates)[number];

export const revisions = sqliteTable(
  "revisions",
  {
    id: text("id").primaryKey(),
    videoId: text("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    state: text("state", { enum: revisionStates }).notNull(),
    uploadedBy: text("uploaded_by")
      .notNull()
      .references(() => members.id),
    muxUploadId: text("mux_upload_id"),
    muxAssetId: text("mux_asset_id"),
    muxPlaybackId: text("mux_playback_id"),
    durationMs: integer("duration_ms"),
    frameRate: real("frame_rate"),
    aspectRatio: text("aspect_ratio"),
    errorCode: text("error_code"),
    createdAt: integer("created_at").notNull(),
    readyAt: integer("ready_at"),
  },
  (table) => [
    uniqueIndex("revisions_video_id_number_idx").on(table.videoId, table.number),
    index("revisions_state_idx").on(table.state),
  ],
);

export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    revisionId: text("revision_id")
      .notNull()
      .references(() => revisions.id, { onDelete: "cascade" }),
    memberId: text("member_id").references(() => members.id),
    shareLinkId: text("share_link_id"),
    authorName: text("author_name").notNull(),
    timecodeMs: integer("timecode_ms").notNull(),
    body: text("body").notNull(),
    drawing: text("drawing"),
    resolvedAt: integer("resolved_at"),
    resolvedBy: text("resolved_by").references(() => members.id),
    createdAt: integer("created_at").notNull(),
    editedAt: integer("edited_at"),
  },
  (table) => [
    index("comments_revision_id_timecode_idx").on(table.revisionId, table.timecodeMs),
    check(
      "comments_one_author",
      sql`(${table.memberId} IS NOT NULL) <> (${table.shareLinkId} IS NOT NULL)`,
    ),
  ],
);

export const videoReads = sqliteTable(
  "video_reads",
  {
    memberId: text("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    videoId: text("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    lastReadAt: integer("last_read_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.memberId, table.videoId] })],
);

export const sharePermissions = ["view", "comment"] as const;
export type SharePermission = (typeof sharePermissions)[number];

export const shareLinks = sqliteTable(
  "share_links",
  {
    id: text("id").primaryKey(),
    videoId: text("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Plain text so the link can be copied again; see the spec's storage decision.
    token: text("token").notNull().unique(),
    permission: text("permission", { enum: sharePermissions }).notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => members.id),
    createdAt: integer("created_at").notNull(),
    revokedAt: integer("revoked_at"),
  },
  (table) => [index("share_links_video_id_idx").on(table.videoId)],
);

export const feedbackKinds = ["broken", "idea", "other"] as const;
export type FeedbackKind = (typeof feedbackKinds)[number];

/** Site feedback from anyone: Members, Guests or signed-out people. Kept only in D1. */
export const feedback = sqliteTable(
  "feedback",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: feedbackKinds }).notNull(),
    message: text("message").notNull(),
    contact: text("contact"),
    // JSON from the browser, with Share Link and Invite tokens removed.
    diagnostics: text("diagnostics").notNull(),
    // No foreign key: a report outlives anything it mentions.
    memberId: text("member_id"),
    createdAt: integer("created_at").notNull(),
    handledAt: integer("handled_at"),
    handledNote: text("handled_note"),
  },
  (table) => [index("feedback_created_at_idx").on(table.createdAt)],
);
