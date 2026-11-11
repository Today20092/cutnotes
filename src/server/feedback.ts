import { auth } from "@clerk/tanstack-react-start/server";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";
import { and, desc, eq, isNull } from "drizzle-orm";
import {
  activeMember,
  allowPublicFeedback,
  parse,
  readAsMember,
  refuse,
  requireMember,
} from "@/server/access";
import { getDb } from "@/server/db";
import { feedback, feedbackKinds, members, type FeedbackKind } from "@/server/db/schema";

export type FeedbackInput = {
  kind: FeedbackKind;
  message: string;
  contact?: string;
  diagnostics: Record<string, unknown>;
};

const maxDiagnostics = 20_000;
const feedbackInput = v.object({
  kind: v.picklist(feedbackKinds),
  message: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(5000)),
  contact: v.optional(v.pipe(v.string(), v.maxLength(200), v.trim())),
  diagnostics: v.custom<Record<string, unknown>>(
    (value) => typeof value === "object" && value !== null && !Array.isArray(value),
  ),
});

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Share Link (32 characters) and Invite (43) tokens are credentials and can appear in paths
 * and query keys, so any token-like run is removed before storage. UUIDs are not secret.
 */
export const withoutTokens = (value: string) =>
  value
    .replace(/\/(share|invite)\/[^\s"?/#]+/gi, "/$1/[removed]")
    .replace(/(?:Bearer\s+\S+|(?:sk|pk)_(?:live|test)_\w+|eyJ[\w-]+\.[\w-]+\.[\w-]+)/g, "[removed]")
    .replace(/[A-Za-z0-9_-]{32,}/g, (run) => (uuid.test(run) ? run : "[removed]"));

/** Public on purpose: anyone, even someone who cannot sign in, can report a problem. */
export const sendFeedback = createServerFn({ method: "POST" })
  .validator((data: FeedbackInput) => data)
  .handler(async ({ data }) => {
    await allowPublicFeedback();
    const { kind, message, contact } = parse(feedbackInput, data);
    const diagnostics = JSON.stringify(data.diagnostics);
    if (diagnostics.length > maxDiagnostics) refuse(400, "invalid-request");

    const db = getDb();
    const { userId } = await auth();
    const [member] = userId
      ? await db
          .select({ id: members.id, role: members.role })
          .from(members)
          .where(and(eq(members.clerkUserId, userId), isNull(members.removedAt)))
      : [];
    await db.insert(feedback).values({
      id: crypto.randomUUID(),
      kind,
      message: withoutTokens(message),
      contact: contact && withoutTokens(contact),
      diagnostics: JSON.stringify(
        {
          ...data.diagnostics,
          sender: member
            ? { role: member.role, memberId: member.id }
            : {
                role:
                  typeof data.diagnostics.path === "string" &&
                  data.diagnostics.path.startsWith("/share/")
                    ? "Guest"
                    : "Signed out",
              },
        },
        (key, value: unknown) =>
          /token|cookie|authorization|password|secret/i.test(key)
            ? "[removed]"
            : typeof value === "string"
              ? withoutTokens(value).replace(/\?[^\s"#]*/g, "?[removed]")
              : value,
      ),
      memberId: member?.id ?? null,
      createdAt: Date.now(),
      handledAt: null,
    });
    return null;
  });

export const listFeedback = createServerFn({ method: "POST" }).handler(async () => {
  const {
    results: [reports],
  } = await readAsMember("owner", (db) => [
    db
      .select({
        id: feedback.id,
        kind: feedback.kind,
        message: feedback.message,
        contact: feedback.contact,
        diagnostics: feedback.diagnostics,
        createdAt: feedback.createdAt,
        handledAt: feedback.handledAt,
        handledNote: feedback.handledNote,
        memberName: members.displayName,
      })
      .from(feedback)
      .leftJoin(members, eq(members.id, feedback.memberId))
      .orderBy(desc(feedback.createdAt))
      .limit(200),
  ]);
  return { reports };
});

export const markFeedback = createServerFn({ method: "POST" })
  .validator((data: { id: string; handled: boolean; note?: string }) => data)
  .handler(async ({ data }) => {
    const owner = await requireMember("owner");
    const {
      id: reportId,
      handled,
      note,
    } = parse(
      v.object({
        id: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
        handled: v.boolean(),
        note: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(2000))),
      }),
      data,
    );
    const [written] = await getDb()
      .update(feedback)
      .set({
        handledAt: handled ? Date.now() : null,
        handledNote: handled && note ? withoutTokens(note) : null,
      })
      .where(and(eq(feedback.id, reportId), activeMember(owner.id, "owner")))
      .returning({ id: feedback.id });
    if (!written) refuse(404, "not-found");
    return null;
  });
