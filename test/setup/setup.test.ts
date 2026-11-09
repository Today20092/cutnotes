import { expect, test } from "vitest";
import { runSetup } from "../../scripts/setup";

const placeholder = "00000000-0000-0000-0000-000000000000";
const realId = "11111111-2222-4333-8444-555555555555";
const config = `{
  "d1_databases": [
    {
      // Local development only. The setup script writes the real ID here.
      "database_name": "cutnotes",
      "database_id": "${placeholder}"
    }
  ],
  "vars": {
    "TEAM_NAME": "Cutnotes",
    "TEAM_LOGO_URL": "",
    "APP_ORIGIN": "http://localhost:5173",
    "FIRST_OWNER_EMAIL": ""
  }
}
`;
const args = [
  "--team-name", "Haithem Studio",
  "--team-logo-url", "https://studio.example/logo.png",
  "--first-owner-email", "owner@studio.example",
  "--origin", "https://review.studio.example",
  "--location", "weur",
];

function harness(start = config) {
  const state = { config: start, calls: [] as string[][], configAtSecret: "" };
  const deps = {
    readConfig: () => state.config,
    writeConfig: (text: string) => { state.config = text; },
    createDatabase: (wranglerArgs: string[]) => {
      state.calls.push(wranglerArgs);
      return `Created.\n"database_id": "${realId}"\n`;
    },
    wrangler: (wranglerArgs: string[]) => {
      if (wranglerArgs[0] === "secret") state.configAtSecret ||= state.config;
      state.calls.push(wranglerArgs);
    },
    log: () => {},
  };
  return { state, deps };
}

test("creates D1 at the location, records the setup inputs, stores secrets and migrates", () => {
  const { state, deps } = harness();
  runSetup(args, deps);

  expect(state.calls[0]).toEqual(["d1", "create", "cutnotes", "--location", "weur"]);
  expect(state.config).toContain(`"database_id": "${realId}"`);
  expect(state.config).toContain(`"TEAM_NAME": "Haithem Studio"`);
  expect(state.config).toContain(`"TEAM_LOGO_URL": "https://studio.example/logo.png"`);
  expect(state.config).toContain(`"APP_ORIGIN": "https://review.studio.example"`);
  expect(state.config).toContain(`"FIRST_OWNER_EMAIL": "owner@studio.example"`);
  expect(state.config).toContain("// Local development only");

  expect(state.calls.filter((c) => c[0] === "secret").map((c) => c[2])).toEqual([
    "CLERK_SECRET_KEY",
    "CLERK_PUBLISHABLE_KEY",
    "CLERK_JWT_KEY",
    "MUX_TOKEN_ID",
    "MUX_TOKEN_SECRET",
    "MUX_WEBHOOK_SECRET",
    "MUX_SIGNING_KEY_ID",
    "MUX_SIGNING_PRIVATE_KEY",
  ]);
  expect(state.calls.at(-1)).toEqual(["d1", "migrations", "apply", "DB", "--remote"]);
});

test("never deploys", () => {
  const { state, deps } = harness();
  runSetup(args, deps);
  expect(state.calls.flat()).not.toContain("deploy");
});

test("records the database before asking for secrets, so a failed secret loses nothing", () => {
  const { state, deps } = harness();
  runSetup(args, deps);
  expect(state.configAtSecret).toContain(realId);
});

test("a rerun keeps the existing database instead of creating another", () => {
  const { state, deps } = harness(config.replace(placeholder, realId));
  runSetup(args, deps);
  expect(state.calls.some((c) => c[1] === "create")).toBe(false);
  expect(state.config).toContain(realId);
});

test("a Team name with quotes and replacement patterns stays literal and valid", () => {
  const { state, deps } = harness();
  const name = `Dad's "Best" $& Cuts`;
  runSetup(args.with(1, name), deps);
  expect(state.config).toContain(`"TEAM_NAME": ${JSON.stringify(name)}`);
});

test("the logo is optional", () => {
  const { state, deps } = harness();
  runSetup(args.toSpliced(2, 2), deps);
  expect(state.config).toContain(`"TEAM_LOGO_URL": ""`);
});

test.each([
  ["a missing Team name", args.toSpliced(0, 2), /--team-name/],
  ["an invalid email", args.with(5, "nobody"), /--first-owner-email/],
  ["an origin with a path", args.with(7, "https://x.example/app"), /--origin/],
  ["a non-https origin", args.with(7, "http://x.example"), /--origin/],
  ["a non-https logo", args.with(3, "http://x.example/l.png"), /--team-logo-url/],
  ["an unknown location", args.with(9, "me"), /no primary.*Middle East/],
] as const)("refuses %s before touching anything", (_name, bad, message) => {
  const { state, deps } = harness();
  expect(() => runSetup([...bad], deps)).toThrow(message);
  expect(state.calls).toEqual([]);
  expect(state.config).toBe(config);
});

test("stops when Wrangler reports no database ID", () => {
  const { state, deps } = harness();
  expect(() => runSetup(args, { ...deps, createDatabase: () => "oops" })).toThrow(/database ID/);
  expect(state.config).toBe(config);
});

test.each(["database_id", "database_name", "TEAM_NAME", "TEAM_LOGO_URL", "APP_ORIGIN", "FIRST_OWNER_EMAIL"])(
  "refuses a config missing %s before provisioning anything",
  (key) => {
    const { state, deps } = harness(config.replace(`"${key}"`, `"missing_${key}"`));
    expect(() => runSetup(args, deps)).toThrow(new RegExp(key));
    expect(state.calls).toEqual([]);
  },
);
