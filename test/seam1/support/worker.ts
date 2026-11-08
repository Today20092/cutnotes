import { env, exports } from "cloudflare:workers";
import { fromCrossJSON, toJSON } from "seroval";
// Start only registers a server function once its module is compiled.
import "@/server/app-shell";
import "@/server/invites";
import "@/server/projects";

export type CallOptions = {
  bearer?: string;
  cookie?: string;
  /** Overrides the Origin header, to forge a cross-site call. */
  origin?: string;
  /** The server function's input, serialized as Start's client does. */
  data?: unknown;
};

/** Start's dev-mode ID for a server function, from its source file and export. */
const serverFnId = (file: string, exportName: string) =>
  btoa(
    JSON.stringify({
      file: `${file}?tss-serverfn-split`,
      export: `${exportName}_createServerFn_handler`,
    }),
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const invitesFile = "/src/server/invites.ts";

/** Only an Owner may call these. */
export const ownerServerFunctionIds = {
  createInvite: serverFnId(invitesFile, "createInvite"),
  listInvites: serverFnId(invitesFile, "listInvites"),
  revokeInvite: serverFnId(invitesFile, "revokeInvite"),
} as const;

/** These need an active Member. */
export const memberServerFunctionIds = {
  getAppShell: serverFnId("/src/server/app-shell.ts", "getAppShell"),
  listProjects: serverFnId("/src/server/projects.ts", "listProjects"),
  getProject: serverFnId("/src/server/projects.ts", "getProject"),
  createProject: serverFnId("/src/server/projects.ts", "createProject"),
  renameProject: serverFnId("/src/server/projects.ts", "renameProject"),
  ...ownerServerFunctionIds,
} as const;

/** Every server function in the app. A test fails if one is missing from this list. */
export const serverFunctionIds = {
  ...memberServerFunctionIds,
  // The one exception to Member-only: this is how a signed-in person becomes a Member.
  redeemInvite: serverFnId(invitesFile, "redeemInvite"),
} as const;

/** Calls a server function over HTTP against the real Worker, as the browser would. */
export function callServerFn(id: string, options: CallOptions = {}) {
  const headers = new Headers({
    "x-tsr-serverfn": "true",
    origin: options.origin ?? env.APP_ORIGIN,
  });
  if (options.bearer) headers.set("authorization", `Bearer ${options.bearer}`);
  if (options.cookie) headers.set("cookie", options.cookie);
  if (options.data !== undefined) headers.set("content-type", "application/json");
  return exports.default.fetch(
    new Request(`${env.APP_ORIGIN}/_serverFn/${id}`, {
      method: "POST",
      headers,
      body:
        options.data === undefined
          ? undefined
          : JSON.stringify(toJSON({ data: options.data })),
    }),
  );
}

export function fetchPath(path: string) {
  return exports.default.fetch(new Request(`${env.APP_ORIGIN}${path}`));
}

export async function resultOf<T>(response: Response): Promise<T> {
  const payload = fromCrossJSON(await response.json(), {
    plugins: [],
    refs: new Map(),
  }) as {
    result: T;
  };
  return payload.result;
}
