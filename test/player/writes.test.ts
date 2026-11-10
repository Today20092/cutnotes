import assert from "node:assert/strict";
import test from "node:test";
import { MutationObserver, QueryClient, QueryObserver } from "@tanstack/react-query";
import { projectsKey, refreshProjects, videoWrite } from "../../src/lib/writes";

type Video = { id: string; title: string; status: string };
type List = { videos: Video[] };

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function fixture(screenOpen = true) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  let fetches = 0;
  client.setQueryData<List>(projectsKey, { videos: [{ id: "v", title: "old", status: "open" }] });
  // A mounted observer makes invalidation refetch, as an open screen does.
  const observer = new QueryObserver<List>(client, {
    queryKey: projectsKey,
    staleTime: Infinity,
    queryFn: async () => {
      fetches++;
      return { videos: [{ id: "v", title: "server", status: "open" }] };
    },
  });
  if (screenOpen) observer.subscribe(() => {});
  const write = (field: "title" | "status", server: Promise<void>) =>
    new MutationObserver(
      client,
      videoWrite<Video, List, typeof field, { videoId: string; value: string }>(client, {
        videoId: "v",
        field,
        mutationFn: () => server,
        apply: (video, { value }) => ({ ...video, [field]: value }),
      }),
    );
  const video = () => client.getQueryData<List>(projectsKey)!.videos[0]!;
  return { client, write, video, fetches: () => fetches };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("a failed write restores only its field while a later write is pending", async () => {
  // No open screen, so the final refresh only marks the cache stale and the rollback stays visible.
  const { write, video } = fixture(false);
  const first = deferred();
  const second = deferred();
  const a = write("title", first.promise)
    .mutate({ videoId: "v", value: "A" })
    .catch(() => {});
  await tick();
  const b = write("status", second.promise)
    .mutate({ videoId: "v", value: "done" })
    .catch(() => {});
  await tick();
  assert.deepEqual(video(), { id: "v", title: "A", status: "done" });

  first.reject(new Error("no"));
  await a;
  assert.deepEqual(video(), { id: "v", title: "old", status: "done" });

  second.reject(new Error("no"));
  await b;
  assert.deepEqual(video(), { id: "v", title: "old", status: "open" });
});

test("a failed write superseded by a later write keeps the later value, and rebases its rollback", async () => {
  const { write, video } = fixture(false);
  const first = deferred();
  const second = deferred();
  const a = write("title", first.promise)
    .mutate({ videoId: "v", value: "A" })
    .catch(() => {});
  await tick();
  const b = write("title", second.promise)
    .mutate({ videoId: "v", value: "B" })
    .catch(() => {});
  await tick();
  first.reject(new Error("no"));
  await a;
  assert.equal(video().title, "B");
  second.reject(new Error("no"));
  await b;
  // Without the rebase, the second rollback would bring back title "A".
  assert.equal(video().title, "old");
});

test("refetch waits until the last write settles", async () => {
  const { client, write, video, fetches } = fixture();
  const first = deferred();
  const second = deferred();
  const a = write("title", first.promise).mutate({ videoId: "v", value: "A" });
  await tick();
  const b = write("status", second.promise).mutate({ videoId: "v", value: "done" });
  await tick();
  first.resolve();
  await a;
  await refreshProjects(client);
  await tick();
  assert.equal(fetches(), 0);
  assert.deepEqual(video(), { id: "v", title: "A", status: "done" });

  second.resolve();
  await b;
  await tick();
  assert.equal(fetches(), 1);
  assert.equal(video().title, "server");
});
