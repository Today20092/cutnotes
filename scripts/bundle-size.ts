// Prints the client JS and CSS sizes from the last `bun run build`, raw and gzipped.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const dir = "dist/client/assets";
const rows = readdirSync(dir)
  .filter((name) => name.endsWith(".js") || name.endsWith(".css"))
  .map((name) => {
    const bytes = readFileSync(join(dir, name));
    return { name, raw: bytes.length, gzip: gzipSync(bytes, { level: 9 }).length };
  })
  .sort((a, b) => b.raw - a.raw);

const kb = (n: number) => `${(n / 1024).toFixed(1)} kB`;
for (const ext of [".js", ".css"]) {
  const files = rows.filter((row) => row.name.endsWith(ext));
  const raw = files.reduce((sum, row) => sum + row.raw, 0);
  const gzip = files.reduce((sum, row) => sum + row.gzip, 0);
  console.log(`${ext} total: ${files.length} files, ${kb(raw)} raw, ${kb(gzip)} gzip`);
}
for (const row of rows.slice(0, Number(process.argv[2] ?? 12))) {
  console.log(`${row.name.padEnd(48)} ${kb(row.raw).padStart(10)} ${kb(row.gzip).padStart(10)}`);
}
