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

import { frameTime, playbackComments, spokenFrameTime } from "../../src/lib/comment-time";
test("playback previews group the latest unresolved timestamp and expire", () => {
  const rows = [
    { id: "a", timecodeMs: 1000, resolvedAt: null },
    { id: "b", timecodeMs: 1000, resolvedAt: null },
    { id: "c", timecodeMs: 2000, resolvedAt: 1 },
  ];
  assert.deepEqual(playbackComments(rows, 999), []);
  assert.deepEqual(
    playbackComments(rows, 1000).map((r) => r.id),
    ["a", "b"],
  );
  assert.deepEqual(
    playbackComments(rows, 2500).map((r) => r.id),
    ["a", "b"],
  );
  assert.deepEqual(playbackComments(rows, 7000), []);
  assert.deepEqual(playbackComments(rows, 0), []);
});

test("frame time follows the Revision rate and carries into the next second", () => {
  assert.equal(frameTime(5040, 25), "0:05:01");
  assert.equal(frameTime(5040, 60), "0:05:02");
  assert.equal(frameTime(5990, 25), "0:06:00");
  assert.equal(frameTime(333, null), "0:00:10");
  assert.equal(frameTime(60060, 29.97), "1:00:00");
  assert.equal(spokenFrameTime(60060, 29.97), "1 min 0 sec, frame 0");
});
