import { expect, test } from "vitest";
import { readFileSync } from "node:fs";

const staging = JSON.parse(readFileSync("wrangler.staging.jsonc", "utf8"));
const production = JSON.parse(readFileSync("wrangler.production.jsonc", "utf8"));

test("staging cannot target production data, domain or rate limit namespaces", () => {
  expect(staging.account_id).toBe(production.account_id);
  expect(staging.name).not.toBe(production.name);
  expect(staging.vars.APP_ORIGIN).not.toBe(production.vars.APP_ORIGIN);
  expect(staging.routes).toBeUndefined();
  expect(staging.d1_databases[0].database_id).not.toBe(production.d1_databases[0].database_id);
  expect(staging.d1_databases[0].database_name).not.toBe(production.d1_databases[0].database_name);
  const productionNamespaces = production.ratelimits.map(
    (limit: { namespace_id: string }) => limit.namespace_id,
  );
  for (const limit of staging.ratelimits) {
    expect(productionNamespaces).not.toContain(limit.namespace_id);
  }
});

test("deployment configs contain only public settings and keep required bindings", () => {
  for (const config of [staging, production]) {
    expect(config.d1_databases[0].binding).toBe("DB");
    expect(config.triggers.crons).toEqual(["0 * * * *"]);
    expect(config.observability.enabled).toBe(true);
    expect(config.vars.FIRST_OWNER_EMAIL).toBeTruthy();
    expect(Object.keys(config.vars).sort()).toEqual([
      "APP_ORIGIN",
      "FIRST_OWNER_EMAIL",
      "TEAM_LOGO_URL",
      "TEAM_NAME",
    ]);
  }
});
