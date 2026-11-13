import assert from "node:assert/strict";
import test from "node:test";
import { markerRates, premiereMarkers } from "../../src/lib/marker-export";
import type { Comment } from "../../src/server/comment-rules";
const comments: Comment[] = [
  {
    id: "b",
    authorName: "Editor & client",
    authorAvatarUrl: null,
    timecodeMs: 4500,
    body: 'Fix <this> "shot"\u0000',
    drawing: [
      {
        tool: "pen",
        color: "red",
        pts: [
          [0, 0],
          [1, 1],
        ],
      },
    ],
    resolvedAt: null,
    createdAt: 1,
    isGuest: false,
  },
  {
    id: "a",
    authorName: "Client",
    authorAvatarUrl: null,
    timecodeMs: 1000,
    body: "Done",
    drawing: null,
    resolvedAt: 1,
    createdAt: 1,
    isGuest: true,
  },
];
const input = {
  title: "A & B",
  revision: 2,
  comments,
  rate: markerRates[4],
  startTimecode: "01:00:00:00",
  unresolvedOnly: false,
  durationMs: 10000,
};
test("XML escapes text, sorts markers, preserves author/status/drawing and start timecode", () => {
  const output = premiereMarkers(input);
  assert.match(output, /<frame>108000<\/frame>/);
  assert.match(output, /<duration>300<\/duration>/);
  assert.match(output, /Fix &lt;this&gt; &quot;shot&quot;/);
  assert.match(output, /Author: Editor &amp; client/);
  assert.match(output, /Includes a drawing/);
  assert.equal(output.includes(String.fromCharCode(0)), false);
  assert.ok(output.indexOf("<in>30</in>") < output.indexOf("<in>135</in>"));
});
test("unresolved filter excludes resolved markers and rejects empty exports", () => {
  const output = premiereMarkers({ ...input, unresolvedOnly: true });
  assert.equal((output.match(/<marker>/g) || []).length, 1);
  assert.throws(() => premiereMarkers({ ...input, comments: [] }), /No comments/);
});
test("fractional frame rates use rational NTSC time with non-drop display", () => {
  const output = premiereMarkers({
    ...input,
    rate: markerRates[3],
    comments: [{ ...comments[0]!, timecodeMs: 3600000 }],
    durationMs: 3601000,
  });
  assert.match(output, /<ntsc>TRUE<\/ntsc>/);
  assert.match(output, /<in>107892<\/in>/);
  assert.match(output, /<displayformat>NDF<\/displayformat>/);
});
test("reject invalid start timecodes rather than silently shifting markers", () => {
  for (const startTimecode of ["24:00:00:00", "00:60:00:00", "00:00:00:30", "01:00:00;00", "junk"])
    assert.throws(() => premiereMarkers({ ...input, startTimecode }), /valid non-drop/);
});
