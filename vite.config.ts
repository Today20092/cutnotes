import { execSync } from "node:child_process";
import path from "node:path";
import { localPreview } from "./scripts/preview/plugin";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const src = path.resolve(import.meta.dirname, "src");

/** The commit a build came from, so a Site feedback report names the code it ran. */
function buildId() {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

export default defineConfig(({ mode }) => {
  const preview = mode === "preview";
  const e2e = mode === "e2e" || preview;
  return {
    server: { port: 5173, strictPort: true },
    define: { "import.meta.env.VITE_BUILD_ID": JSON.stringify(buildId()) },
    resolve: {
      alias: [
        // Seam 2 replaces Clerk's browser SDK and the Mux gateway. The server still verifies real tokens.
        ...(e2e
          ? [
              {
                find: "@/server/clerk-profile",
                replacement: path.resolve(import.meta.dirname, "e2e/support/fake-clerk-profile.ts"),
              },
              {
                find: /^@\/server\/mux$/,
                replacement: path.resolve(
                  import.meta.dirname,
                  preview ? "scripts/preview/mux.ts" : "e2e/support/fake-mux-module.ts",
                ),
              },
              {
                find: "@/auth/client",
                replacement: path.resolve(
                  import.meta.dirname,
                  preview ? "scripts/preview/auth.tsx" : "e2e/support/fake-auth-client.tsx",
                ),
              },
            ]
          : []),
        { find: "@", replacement: src },
      ],
    },
    plugins: [
      ...(preview ? [localPreview()] : []),
      cloudflare({
        viteEnvironment: { name: "ssr" },
        ...(e2e ? { persistState: { path: ".wrangler/e2e" } } : {}),
      }),
      tanstackStart(),
      viteReact(),
      tailwindcss(),
    ],
  };
});
