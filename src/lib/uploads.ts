import { useSyncExternalStore } from "react";
import { createUploadQueue } from "@/lib/upload-queue";
import { projectListQuery } from "@/lib/projects";
import { cancelUpload, startUpload } from "@/server/videos";

const MAX_BYTES = 20 * 1024 ** 3;
const MAX_SECONDS = 12 * 60 * 60;
const PROBE_TIMEOUT_MS = 10_000;
// Must be a multiple of 256 KB. To be tuned on real phones.
const CHUNK_SIZE_KB = 8192;

export type { UploadTarget, UploadPhase, UploadItem } from "@/lib/upload-queue";

function warnBeforeLeaving(event: BeforeUnloadEvent) {
  event.preventDefault();
}

const queue = createUploadQueue({
  start: (target) => startUpload({ data: target }),
  cancel: (revisionId) => cancelUpload({ data: { revisionId } }),
  refresh: (client) => {
    void client.invalidateQueries({ queryKey: projectListQuery.queryKey });
  },
  warn: (enabled) =>
    window[enabled ? "addEventListener" : "removeEventListener"]("beforeunload", warnBeforeLeaving),
  transfer: async (endpoint, file, cancelled, events) => {
    // Browser-only, so it stays out of the Worker's bundle.
    const { createUpload } = await import("@mux/upchunk");
    if (cancelled()) return () => {};
    const upload = createUpload({ endpoint, file, chunkSize: CHUNK_SIZE_KB });
    upload.on("progress", ({ detail }: CustomEvent<number>) => events.progress(detail));
    upload.on("offline", events.offline);
    upload.on("online", events.online);
    upload.on("error", events.error);
    upload.on("success", events.success);
    return () => upload.abort();
  },
});

export const enqueueUpload = queue.enqueue;
export const retryUpload = queue.retry;
export const dismissUpload = queue.dismiss;
export const stopUpload = queue.stop;
export const useUploads = () =>
  useSyncExternalStore(queue.subscribe, queue.snapshot, queue.snapshot);

/** Null when the browser cannot read the file. The server re-checks at `ready`. */
function probeDuration(file: File) {
  return new Promise<number | null>((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const finish = (seconds: number | null) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      resolve(seconds);
    };
    const timer = setTimeout(() => finish(null), PROBE_TIMEOUT_MS);
    video.preload = "metadata";
    video.onloadedmetadata = () => finish(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => finish(null);
    video.src = url;
  });
}

/** Why this file cannot be sent, or null when it can. */
export async function checkUploadLimits(file: File): Promise<string | null> {
  if (file.size > MAX_BYTES) {
    return `${file.name} is over the 20 GB limit. Export a smaller file.`;
  }
  const seconds = await probeDuration(file);
  if (seconds !== null && seconds > MAX_SECONDS) {
    return `${file.name} is over the 12-hour limit. Export a shorter cut.`;
  }
  return null;
}
