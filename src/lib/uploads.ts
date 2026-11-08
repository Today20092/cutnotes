import type { QueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { projectListQuery } from "@/lib/projects";
import { cancelUpload, startUpload } from "@/server/videos";

const MAX_BYTES = 20 * 1024 ** 3;
const MAX_SECONDS = 12 * 60 * 60;
const PROBE_TIMEOUT_MS = 10_000;
// Must be a multiple of 256 KB. To be tuned on real phones.
const CHUNK_SIZE_KB = 8192;

export type UploadTarget =
  | { projectId: string; title: string }
  | { videoId: string };

export type UploadPhase =
  | "waiting"
  | "sending"
  | "paused"
  | "sent"
  | "failed"
  | "too-late";

export type UploadItem = {
  id: string;
  label: string;
  phase: UploadPhase;
  percent: number;
};

type Transfer = {
  file: File;
  target: UploadTarget;
  client: QueryClient;
  abort?: () => void;
  revisionId?: string;
  cancelled?: boolean;
};

let items: UploadItem[] = [];
const transfers = new Map<string, Transfer>();
const listeners = new Set<() => void>();

const isRunning = ({ phase }: UploadItem) =>
  phase === "sending" || phase === "paused";
const isUnfinished = (item: UploadItem) =>
  item.phase === "waiting" || isRunning(item);

function warnBeforeLeaving(event: BeforeUnloadEvent) {
  event.preventDefault();
}

let warning = false;
function publish(next: UploadItem[]) {
  items = next;
  const shouldWarn = items.some(isUnfinished);
  if (shouldWarn !== warning) {
    warning = shouldWarn;
    window[shouldWarn ? "addEventListener" : "removeEventListener"](
      "beforeunload",
      warnBeforeLeaving,
    );
  }
  listeners.forEach((listener) => listener());
}

function update(id: string, changes: Partial<UploadItem>) {
  const current = items.find((item) => item.id === id);
  if (!current) return;
  // Progress fires far more often than the rounded percent changes.
  if (Object.entries(changes).every(([key, value]) => current[key as keyof UploadItem] === value)) {
    return;
  }
  publish(items.map((item) => (item === current ? { ...item, ...changes } : item)));
}

function remove(id: string) {
  transfers.delete(id);
  publish(items.filter((item) => item.id !== id));
}

const refresh = (client: QueryClient) =>
  client.invalidateQueries({ queryKey: projectListQuery.queryKey });

/** One upload at a time: a phone on a weak connection cannot serve several. */
function startNext() {
  if (items.some(isRunning)) return;
  const next = items.find((item) => item.phase === "waiting");
  if (next) void send(next.id);
}

async function discardOnServer(transfer: Transfer) {
  if (!transfer.revisionId) return;
  await cancelUpload({ data: { revisionId: transfer.revisionId } });
  transfer.revisionId = undefined;
  void refresh(transfer.client);
}

function fail(id: string, transfer: Transfer) {
  update(id, { phase: "failed" });
  // Retry starts over, so the abandoned Revision should not linger.
  discardOnServer(transfer).catch(() => {});
  startNext();
}

async function send(id: string) {
  const transfer = transfers.get(id);
  if (!transfer) return;
  update(id, { phase: "sending", percent: 0 });

  try {
    const started = await startUpload({ data: transfer.target });
    transfer.revisionId = started.revisionId;
    void refresh(transfer.client);
    if (transfer.cancelled) return;

    // Browser-only, so it stays out of the Worker's bundle.
    const { createUpload } = await import("@mux/upchunk");
    if (transfer.cancelled) return;
    const upload = createUpload({
      endpoint: started.uploadUrl,
      file: transfer.file,
      chunkSize: CHUNK_SIZE_KB,
    });
    transfer.abort = () => upload.abort();
    upload.on("progress", ({ detail }: CustomEvent<number>) =>
      update(id, { percent: Math.floor(detail) }),
    );
    upload.on("offline", () => update(id, { phase: "paused" }));
    upload.on("online", () => update(id, { phase: "sending" }));
    upload.on("error", () => fail(id, transfer));
    upload.on("success", () => {
      update(id, { phase: "sent", percent: 100 });
      void refresh(transfer.client);
      startNext();
    });
  } catch {
    if (!transfer.cancelled) fail(id, transfer);
  }
}

export function enqueueUpload(input: {
  file: File;
  label: string;
  target: UploadTarget;
  client: QueryClient;
}) {
  const id = crypto.randomUUID();
  transfers.set(id, {
    file: input.file,
    target: input.target,
    client: input.client,
  });
  publish([...items, { id, label: input.label, phase: "waiting", percent: 0 }]);
  startNext();
}

export function retryUpload(id: string) {
  update(id, { phase: "waiting", percent: 0 });
  startNext();
}

export const dismissUpload = remove;

export async function stopUpload(id: string) {
  const transfer = transfers.get(id);
  if (!transfer) return;
  transfer.cancelled = true;
  transfer.abort?.();
  try {
    await discardOnServer(transfer);
    remove(id);
  } catch {
    // Mux already has the whole file, so it will be processed after all.
    update(id, { phase: "too-late" });
  }
  startNext();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useUploads = () =>
  useSyncExternalStore(subscribe, () => items, () => items);

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
    video.onloadedmetadata = () =>
      finish(Number.isFinite(video.duration) ? video.duration : null);
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
