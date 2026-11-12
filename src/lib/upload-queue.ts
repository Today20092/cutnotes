import type { QueryClient } from "@tanstack/react-query";

export type UploadTarget = { projectId: string; title: string } | { videoId: string };
export type UploadPhase =
  | "waiting"
  | "sending"
  | "paused"
  | "sent"
  | "failed"
  | "cancel-failed"
  | "too-late";
export type UploadItem = { id: string; label: string; phase: UploadPhase; percent: number };

type Transfer = {
  file: File;
  target: UploadTarget;
  client: QueryClient;
  abort?: () => void;
  revisionId?: string;
  cancelled?: boolean;
  creating?: boolean;
  attempt?: object;
};

type QueueEffects = {
  start: (target: UploadTarget) => Promise<{ revisionId: string; uploadUrl: string }>;
  cancel: (revisionId: string) => Promise<unknown>;
  refresh: (client: QueryClient) => void;
  transfer: (
    url: string,
    file: File,
    cancelled: () => boolean,
    events: {
      progress: (percent: number) => void;
      offline: () => void;
      online: () => void;
      error: () => void;
      success: () => void;
    },
  ) => Promise<() => void>;
  warn: (enabled: boolean) => void;
};

export function createUploadQueue(effects: QueueEffects) {
  let items: UploadItem[] = [];
  const transfers = new Map<string, Transfer>();
  const listeners = new Set<() => void>();
  let warning = false;
  const isRunning = ({ phase }: UploadItem) => phase === "sending" || phase === "paused";

  function publish(next: UploadItem[]) {
    items = next;
    const shouldWarn = items.some((item) => item.phase === "waiting" || isRunning(item));
    if (shouldWarn !== warning) {
      warning = shouldWarn;
      effects.warn(shouldWarn);
    }
    listeners.forEach((listener) => listener());
  }

  function update(id: string, changes: Partial<UploadItem>) {
    const current = items.find((item) => item.id === id);
    if (
      !current ||
      Object.entries(changes).every(([key, value]) => current[key as keyof UploadItem] === value)
    )
      return;
    publish(items.map((item) => (item === current ? { ...item, ...changes } : item)));
  }

  function remove(id: string) {
    transfers.delete(id);
    publish(items.filter((item) => item.id !== id));
  }

  function startNext() {
    if (items.some(isRunning)) return;
    const next = items.find((item) => item.phase === "waiting");
    if (next) void send(next.id);
  }

  async function discard(transfer: Transfer) {
    if (!transfer.revisionId) return;
    const revisionId = transfer.revisionId;
    await effects.cancel(revisionId);
    if (transfer.revisionId === revisionId) transfer.revisionId = undefined;
    effects.refresh(transfer.client);
  }

  function fail(id: string, transfer: Transfer) {
    transfer.attempt = undefined;
    update(id, { phase: "failed" });
    discard(transfer).catch(() => {});
    startNext();
  }

  async function send(id: string) {
    const transfer = transfers.get(id);
    if (!transfer) return;
    update(id, { phase: "sending", percent: 0 });
    const attempt = {};
    transfer.attempt = attempt;
    const active = () => transfer.attempt === attempt && !transfer.cancelled;
    try {
      transfer.creating = true;
      const started = await effects.start(transfer.target);
      transfer.creating = false;
      transfer.revisionId = started.revisionId;
      effects.refresh(transfer.client);
      if (transfer.cancelled) {
        await stop(id);
        return;
      }
      const abort = await effects.transfer(started.uploadUrl, transfer.file, () => !active(), {
        progress: (percent) => {
          if (active()) update(id, { percent: Math.floor(percent) });
        },
        offline: () => {
          if (active()) update(id, { phase: "paused" });
        },
        online: () => {
          if (active()) update(id, { phase: "sending" });
        },
        error: () => {
          if (active()) fail(id, transfer);
        },
        success: () => {
          if (!active()) return;
          transfer.attempt = undefined;
          update(id, { phase: "sent", percent: 100 });
          effects.refresh(transfer.client);
          startNext();
        },
      });
      if (active()) transfer.abort = abort;
      else abort();
    } catch {
      const wasCreating = transfer.creating;
      transfer.creating = false;
      if (transfer.cancelled && wasCreating) {
        remove(id);
        startNext();
      } else if (active()) fail(id, transfer);
    }
  }

  function enqueue(input: {
    file: File;
    label: string;
    target: UploadTarget;
    client: QueryClient;
  }) {
    const id = crypto.randomUUID();
    transfers.set(id, { file: input.file, target: input.target, client: input.client });
    publish([...items, { id, label: input.label, phase: "waiting", percent: 0 }]);
    startNext();
  }

  function retry(id: string) {
    update(id, { phase: "waiting", percent: 0 });
    startNext();
  }

  async function stop(id: string) {
    const transfer = transfers.get(id);
    if (!transfer) return;
    transfer.cancelled = true;
    transfer.abort?.();
    if (transfer.creating) return;
    try {
      await discard(transfer);
      remove(id);
    } catch (error) {
      update(id, {
        phase: error instanceof Response && error.status === 409 ? "too-late" : "cancel-failed",
      });
    }
    startNext();
  }

  return {
    enqueue,
    retry,
    stop,
    dismiss: remove,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => items,
  };
}
