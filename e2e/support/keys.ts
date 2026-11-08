import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const file = ".wrangler/e2e-keys.json";

type Keys = { privateKey: string; publicKey: string };

/** One generated key pair, shared by Playwright's main process, its workers and the Worker. */
export function e2eKeys(): Keys {
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as Keys;
  const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const keys = {
    privateKey: pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKey: pair.publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
  mkdirSync(".wrangler", { recursive: true });
  writeFileSync(file, JSON.stringify(keys));
  return keys;
}
