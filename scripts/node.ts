// Runs a tool under real Node: workerd's test pool and Wrangler do not work on Bun's runtime.
// Uses Node from PATH when there is one, otherwise the pinned binary in optionalDependencies.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const platform = process.platform === "win32" ? "win" : process.platform;
const bundled = path.resolve(
  `node_modules/node-${platform}-${process.arch}/bin/${platform === "win" ? "node.exe" : "node"}`,
);
const onPath = spawnSync("node", ["--version"]).status === 0;
if (!onPath && !existsSync(bundled)) {
  throw new Error("No Node found: run `bun install`, or put Node on PATH.");
}

const { status } = spawnSync(onPath ? "node" : bundled, process.argv.slice(2), {
  stdio: "inherit",
});
process.exit(status ?? 1);
