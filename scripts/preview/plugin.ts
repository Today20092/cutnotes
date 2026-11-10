import { createReadStream, createWriteStream, mkdirSync, statSync, existsSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { execFileSync } from "node:child_process";
import type { Plugin } from "vite";
import { sessionToken } from "../../e2e/support/session";

/** Installed only by the explicit local preview mode, never in a production build. */
export function localPreview(): Plugin {
  const directory = ".wrangler/preview-videos";
  mkdirSync(directory, { recursive: true });
  return {
    name: "cutnotes-local-preview",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        if (!url.pathname.startsWith("/__preview/")) return next();
        try {
          if (url.pathname === "/__preview/session") {
            res.end(
              sessionToken(
                { clerkUserId: "user_first_owner", email: "first.owner@example.com" },
                86400,
              ),
            );
            return;
          }
          const thumbnail = url.pathname.startsWith("/__preview/thumbnail/");
          const id = url.pathname.slice(
            thumbnail ? "/__preview/thumbnail/".length : "/__preview/video/".length,
          );
          if (!/^[a-f0-9-]{36}$/.test(id)) {
            res.writeHead(400).end();
            return;
          }
          const file = `${directory}/${id}`;
          if (thumbnail) {
            if (req.method !== "GET" && req.method !== "HEAD") {
              res.writeHead(405).end();
              return;
            }
            const image = `${file}.jpg`;
            if (!existsSync(file)) {
              res.writeHead(404).end();
              return;
            }
            if (!existsSync(image))
              execFileSync("ffmpeg", [
                "-v",
                "error",
                "-i",
                file,
                "-frames:v",
                "1",
                "-vf",
                "scale=640:-2",
                "-y",
                image,
              ]);
            res.writeHead(200, {
              "Content-Type": "image/jpeg",
              "Content-Length": statSync(image).size,
              "Cache-Control": "private, max-age=3600",
            });
            if (req.method === "HEAD") res.end();
            else await pipeline(createReadStream(image), res);
            return;
          }
          if (req.method === "PUT") {
            const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(req.headers["content-range"] ?? "");
            const start = range ? Number(range[1]) : 0;
            await pipeline(req, createWriteStream(file, { flags: start ? "r+" : "w", start }));
            if (range && Number(range[2]) + 1 < Number(range[3])) {
              res.writeHead(308, { Range: `bytes=0-${range[2]}` }).end();
              return;
            }
            const duration = Number(
              execFileSync(
                "ffprobe",
                [
                  "-v",
                  "error",
                  "-show_entries",
                  "format=duration",
                  "-of",
                  "default=noprint_wrappers=1:nokey=1",
                  file,
                ],
                { encoding: "utf8" },
              ).trim(),
            );
            if (!Number.isFinite(duration) || duration <= 0)
              throw new Error("Invalid video duration");
            // shortcut: local frame stepping assumes 30 fps; probe stream rate when testing other rates.
            execFileSync("bun", [
              "scripts/node.ts",
              "node_modules/wrangler/bin/wrangler.js",
              "d1",
              "execute",
              "DB",
              "--local",
              "--persist-to",
              ".wrangler/e2e",
              "--command",
              `UPDATE revisions SET state='ready', mux_playback_id='${id}', duration_ms=${Math.round(duration * 1000)}, frame_rate=30, ready_at=${Date.now()} WHERE id='${id}' AND state='uploading'`,
            ]);
            res.writeHead(200).end();
            return;
          }
          if (req.method !== "GET" && req.method !== "HEAD") {
            res.writeHead(405).end();
            return;
          }
          const size = statSync(file).size;
          const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? "");
          const start = range ? Number(range[1]) : 0;
          const end = range?.[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
          if (start > end || start >= size) {
            res.writeHead(416).end();
            return;
          }
          res.writeHead(range ? 206 : 200, {
            "Content-Type": "video/mp4",
            "Accept-Ranges": "bytes",
            "Content-Length": end - start + 1,
            ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
          });
          if (req.method === "HEAD") res.end();
          else await pipeline(createReadStream(file, { start, end }), res);
        } catch (error) {
          console.error("Local preview video failed", error);
          if (!res.headersSent) res.writeHead(500);
          res.end("Local preview video failed");
        }
      });
    },
  };
}
