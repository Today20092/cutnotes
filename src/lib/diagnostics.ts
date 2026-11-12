/** Browser-side record of recent problems, attached to a Site feedback report. Memory only. */

type Problem = { at: string; source: string; detail: string };

const maxProblems = 20;
const problems: Problem[] = [];
const reporters = new Map<string, () => unknown>();

export function describeError(error: unknown): string {
  if (error instanceof Response) return `HTTP ${error.status}`;
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

export function recordProblem(source: string, detail: string) {
  if (typeof window === "undefined") return;
  problems.push({ at: new Date().toISOString(), source, detail: detail.slice(0, 500) });
  if (problems.length > maxProblems) problems.shift();
}

/** A screen part adds its live state to every report while it is mounted. Returns the remover. */
export function reportDiagnostic(key: string, read: () => unknown) {
  reporters.set(key, read);
  return () => {
    if (reporters.get(key) === read) reporters.delete(key);
  };
}

let watching = false;

export function watchProblems() {
  if (watching || typeof window === "undefined") return;
  watching = true;
  window.addEventListener("error", (event) =>
    recordProblem("error", `${event.message} (${event.filename}:${event.lineno})`),
  );
  window.addEventListener("unhandledrejection", (event) =>
    recordProblem("unhandled rejection", describeError(event.reason)),
  );
}

export function collectDiagnostics(extra: Record<string, unknown> = {}) {
  const parts: Record<string, unknown> = {};
  for (const [key, read] of reporters) {
    try {
      parts[key] = read();
    } catch (error) {
      parts[key] = `unreadable: ${describeError(error)}`;
    }
  }
  return {
    path: location.pathname,
    version: import.meta.env.VITE_BUILD_ID ?? "dev",
    time: new Date().toISOString(),
    userAgent: navigator.userAgent,
    language: navigator.language,
    viewport: `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}x`,
    online: navigator.onLine,
    authLoaded: Boolean(window.Clerk),
    signedIn: Boolean(window.Clerk?.session),
    recentProblems: [...problems],
    ...parts,
    ...extra,
  };
}
