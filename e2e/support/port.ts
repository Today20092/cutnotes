/** The port Seam 2 serves the Worker on. Set E2E_PORT when 5199 is taken. */
export const e2ePort = process.env.E2E_PORT || "5199";

/**
 * Where Seam 2 keeps its local D1. A run on its own port gets its own folder, so it
 * neither resets nor clashes with the preview on 5199, which uses the default one.
 */
export const e2eState = process.env.E2E_PORT ? `.wrangler/e2e-${e2ePort}` : ".wrangler/e2e";
