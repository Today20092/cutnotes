// Sets up one install's production resources. See docs/setup.md. Deploying stays a separate human step.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

const LOCATIONS = ["weur", "eeur", "apac", "oc", "wnam", "enam"];
const PLACEHOLDER_ID = "00000000-0000-0000-0000-000000000000";
const SECRETS = [
  "CLERK_SECRET_KEY",
  "CLERK_PUBLISHABLE_KEY",
  "CLERK_JWT_KEY",
  "MUX_TOKEN_ID",
  "MUX_TOKEN_SECRET",
  "MUX_WEBHOOK_SECRET",
  "MUX_SIGNING_KEY_ID",
  "MUX_SIGNING_PRIVATE_KEY",
];

export type SetupDeps = {
  readConfig: () => string;
  writeConfig: (text: string) => void;
  /** Runs `wrangler d1 create` and returns its output. */
  createDatabase: (args: string[]) => string;
  wrangler: (args: string[]) => void;
  log: (message: string) => void;
};

function isHttps(value: string) {
  return URL.canParse(value) && new URL(value).protocol === "https:";
}

function parseInputs(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    options: {
      "team-name": { type: "string" },
      "team-logo-url": { type: "string", default: "" },
      "first-owner-email": { type: "string" },
      origin: { type: "string" },
      location: { type: "string" },
    },
  });
  const teamName = values["team-name"]?.trim();
  const logoUrl = values["team-logo-url"];
  const email = values["first-owner-email"]?.trim() ?? "";
  const origin = values.origin ?? "";
  const location = values.location ?? "";

  if (!teamName) throw new Error("--team-name is required.");
  if (logoUrl && !isHttps(logoUrl)) throw new Error("--team-logo-url must be an https URL.");
  if (!/^[^@\s]+@[^@\s]+$/.test(email))
    throw new Error("--first-owner-email must be an email address.");
  if (!isHttps(origin) || new URL(origin).origin !== origin) {
    throw new Error(
      "--origin must be an https origin with no path, such as https://review.example.com.",
    );
  }
  if (!LOCATIONS.includes(location)) {
    throw new Error(
      `--location must be one of ${LOCATIONS.join(", ")}. D1 has no primary in the Middle East, Africa or South America: choose the nearest location.`,
    );
  }
  return { teamName, logoUrl, email, origin, location };
}

function setValue(config: string, key: string, value: string) {
  // A replacer function, so `$` in a Team name stays literal.
  return config.replace(
    new RegExp(`"${key}":\\s*"(?:[^"\\\\]|\\\\.)*"`),
    () => `"${key}": ${JSON.stringify(value)}`,
  );
}

function readValue(config: string, key: string) {
  return new RegExp(`"${key}":\\s*"([^"]*)"`).exec(config)?.[1];
}

export function runSetup(argv: string[], deps: SetupDeps) {
  const inputs = parseInputs(argv);
  let config = deps.readConfig();
  for (const key of [
    "database_id",
    "database_name",
    "TEAM_NAME",
    "TEAM_LOGO_URL",
    "APP_ORIGIN",
    "FIRST_OWNER_EMAIL",
  ]) {
    if (readValue(config, key) === undefined) {
      throw new Error(
        `wrangler.jsonc is missing ${key}. Restore the complete config before running setup.`,
      );
    }
  }

  if (readValue(config, "database_id") === PLACEHOLDER_ID) {
    const name = readValue(config, "database_name") ?? "cutnotes";
    const output = deps.createDatabase(["d1", "create", name, "--location", inputs.location]);
    const id = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(output)?.[0];
    if (!id) throw new Error(`Wrangler reported no database ID:\n${output}`);
    config = setValue(config, "database_id", id);
  } else {
    deps.log("wrangler.jsonc already names a database: keeping it.");
  }

  config = setValue(config, "TEAM_NAME", inputs.teamName);
  config = setValue(config, "TEAM_LOGO_URL", inputs.logoUrl);
  config = setValue(config, "APP_ORIGIN", inputs.origin);
  config = setValue(config, "FIRST_OWNER_EMAIL", inputs.email);
  // Written before any later step can fail, so a rerun does not create a second database.
  deps.writeConfig(config);

  for (const secret of SECRETS) deps.wrangler(["secret", "put", secret]);
  deps.wrangler(["d1", "migrations", "apply", "DB", "--remote"]);

  deps.log("Setup is done. Deploying is yours to run: see the last step of docs/setup.md.");
}

function wranglerCommand(args: string[]) {
  return [
    process.execPath,
    ["scripts/node.ts", "node_modules/wrangler/bin/wrangler.js", ...args],
  ] as const;
}

if (import.meta.main) {
  const configPath = "wrangler.jsonc";
  try {
    runSetup(process.argv.slice(2), {
      readConfig: () => readFileSync(configPath, "utf8"),
      writeConfig: (text) => writeFileSync(configPath, text),
      createDatabase: (args) => {
        const [command, commandArgs] = wranglerCommand(args);
        const { status, stdout } = spawnSync(command, commandArgs, {
          encoding: "utf8",
          stdio: ["inherit", "pipe", "inherit"],
        });
        if (status !== 0) throw new Error(`wrangler ${args.join(" ")} failed:\n${stdout}`);
        return stdout;
      },
      wrangler: (args) => {
        const [command, commandArgs] = wranglerCommand(args);
        const { status } = spawnSync(command, commandArgs, { stdio: "inherit" });
        if (status !== 0)
          throw new Error(`wrangler ${args.join(" ")} failed. Fix it and run setup again.`);
      },
      log: console.log,
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
