import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

// Every server function must pass through an Access helper before it touches data.
// Add a name here only when a new helper is itself an Access check.
// shortcut: this text scan checks helper presence, use an AST check if control-flow enforcement is needed.
const accessHelpers =
  /\b(requireMember|requireSignedIn|readAsMember|writeAsMember|readShareLink|allowPublicFeedback)\b/;

// A server function that takes browser input checks it in the handler, after Access.
// `parse` is Valibot; `id` and `text` are in src/server/access.ts; `readShareLink` checks the token;
// `decide` (videos.ts) parses its own schema.
const inputChecks = /(?<![\w.])(parse|id|text|readShareLink|decide)\(/;

// Older functions with hand-written checks. Move one to `parse`, `id` or `text`, then remove it here.
// Never add a name.
const inlineInputChecks = new Set([
  "invites.ts:getInvitePreview",
  "invites.ts:listInvites",
  "playback.ts:getReview",
  "playback.ts:markVideoRead",
  "project-members.ts:listProjectMembers",
  "projects.ts:getProject",
  "sharing.ts:listShareLinks",
]);

const dir = "src/server";
const serverFunctions = readdirSync(dir)
  .filter((file) => file.endsWith(".ts"))
  .flatMap((file) =>
    readFileSync(join(dir, file), "utf8")
      .split(/\bexport const /)
      .filter((block) => /^\w+ = createServerFn\(/.test(block))
      .map((block) => ({
        name: `${file}:${block.split(" ")[0]}`,
        // A server function ends at the next top-level export.
        body: block.split(/\nexport /)[0] ?? "",
      })),
  );

// Invite previews use the unexpired token itself as authority and disclose only public metadata.
const functions = serverFunctions.filter((fn) => fn.name !== "invites.ts:getInvitePreview");

test("the scan finds the server functions", () => {
  expect(functions.length).toBeGreaterThan(20);
});

test.each(functions.map((fn) => [fn.name, fn.body] as const))(
  "%s calls an Access helper",
  (_name, body) => {
    expect(body).toMatch(accessHelpers);
  },
);

const withInput = serverFunctions.filter((fn) => fn.body.includes(".validator("));

test.each(withInput.map((fn) => [fn.name, fn.body] as const))(
  "%s checks its browser input",
  (name, body) => {
    if (inlineInputChecks.has(name)) {
      expect(
        inputChecks.test(body),
        `${name} now uses parse, id or text. Remove it from inlineInputChecks.`,
      ).toBe(false);
      return;
    }
    expect(
      inputChecks.test(body),
      `${name} takes browser input but never checks it. After the Access check, read each field with parse(schema, data) (Valibot), or id() or text() from src/server/access.ts.`,
    ).toBe(true);
  },
);

test("the inline-check list names only real server functions", () => {
  const names = new Set(withInput.map((fn) => fn.name));
  for (const name of inlineInputChecks) expect(names, `${name} is gone`).toContain(name);
});
