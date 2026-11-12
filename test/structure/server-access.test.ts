import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

// Every server function must pass through an Access helper before it touches data.
// Add a name here only when a new helper is itself an Access check.
// shortcut: this text scan checks helper presence, use an AST check if control-flow enforcement is needed.
const accessHelpers =
  /\b(requireMember|requireSignedIn|readAsMember|writeAsMember|readShareLink|allowPublicFeedback)\b/;

const dir = "src/server";
const functions = readdirSync(dir)
  .filter((file) => file.endsWith(".ts"))
  .flatMap((file) =>
    readFileSync(join(dir, file), "utf8")
      .split(/\bexport const /)
      .filter((block) => /^\w+ = createServerFn\(/.test(block))
      .map((block) => ({
        name: `${file}:${block.split(" ")[0]}`,
        // A server function ends at the next top-level export.
        body: block.split(/\nexport /)[0] ?? "",
      }))
      // Invite previews use the unexpired token itself as authority and disclose only public metadata.
      .filter((fn) => fn.name !== "invites.ts:getInvitePreview"),
  );

test("the scan finds the server functions", () => {
  expect(functions.length).toBeGreaterThan(20);
});

test.each(functions.map((fn) => [fn.name, fn.body] as const))(
  "%s calls an Access helper",
  (_name, body) => {
    expect(body).toMatch(accessHelpers);
  },
);
