import assert from "node:assert/strict";
import test from "node:test";
import type { QueryClient } from "@tanstack/react-query";
import { createUploadQueue } from "../../src/lib/upload-queue";

const client = {} as QueryClient;
const file = new File(["video"], "video.mp4");
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

test("cancel while starting discards the Revision and advances the queue", async () => {
  let finish!: (value: { revisionId: string; uploadUrl: string }) => void;
  const starts: string[] = [];
  const cancelled: string[] = [];
  const warnings: boolean[] = [];
  const queue = createUploadQueue({
    start: async (target) => {
      const id = "videoId" in target ? target.videoId : target.projectId;
      starts.push(id);
      if (id === "first")
        return new Promise((resolve) => {
          finish = resolve;
        });
      return { revisionId: id, uploadUrl: id };
    },
    cancel: async (id) => {
      cancelled.push(id);
    },
    refresh: () => {},
    warn: (enabled) => {
      warnings.push(enabled);
    },
    transfer: async () => () => {},
  });
  queue.enqueue({ file, label: "first", target: { videoId: "first" }, client });
  queue.enqueue({ file, label: "second", target: { videoId: "second" }, client });
  const first = queue.snapshot()[0]!;
  await queue.stop(first.id);
  assert.deepEqual(starts, ["first"]);
  finish({ revisionId: "first-revision", uploadUrl: "first" });
  await tick();
  assert.deepEqual(cancelled, ["first-revision"]);
  assert.deepEqual(starts, ["first", "second"]);
  assert.equal(queue.snapshot()[0]?.phase, "sending");
  await queue.stop(queue.snapshot()[0]!.id);
  assert.deepEqual(warnings, [true, false]);
});

test("late events from a failed attempt cannot change its retry", async () => {
  const events: Array<Parameters<Parameters<typeof createUploadQueue>[0]["transfer"]>[3]> = [];
  let revision = 0;
  const queue = createUploadQueue({
    start: async () => ({ revisionId: String(++revision), uploadUrl: "url" }),
    cancel: async () => {},
    refresh: () => {},
    warn: () => {},
    transfer: async (_url, _file, _cancelled, handlers) => {
      events.push(handlers);
      return () => {};
    },
  });
  queue.enqueue({ file, label: "video", target: { videoId: "video" }, client });
  await tick();
  const id = queue.snapshot()[0]!.id;
  events[0]!.error();
  queue.retry(id);
  await tick();
  events[0]!.success();
  assert.equal(queue.snapshot()[0]?.phase, "sending");
  events[1]!.success();
  assert.equal(queue.snapshot()[0]?.phase, "sent");
});
