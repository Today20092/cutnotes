import assert from "node:assert/strict";
import test from "node:test";
import { activeCommentId } from "../../src/lib/comment-time";

const rows = [
  { id: "a", timecodeMs: 1000 },
  { id: "b", timecodeMs: 4000 },
];

test("no Comment is active before the first one", () => {
  assert.equal(activeCommentId(rows, 999), null);
});

test("the last Comment reached stays active until the next", () => {
  assert.equal(activeCommentId(rows, 1000), "a");
  assert.equal(activeCommentId(rows, 3999), "a");
  assert.equal(activeCommentId(rows, 9000), "b");
});
