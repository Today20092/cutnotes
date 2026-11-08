import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
});
