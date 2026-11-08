import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { vi } from "vitest";

vi.mock("@/server/mux", async () => {
  const { fakeMux } = await import("./fake-mux");
  return { getMuxGateway: () => fakeMux };
});

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
