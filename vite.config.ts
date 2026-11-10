import path from "node:path";
import { localPreview } from "./scripts/preview/plugin";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const src = path.resolve(import.meta.dirname, "src");

export default defineConfig(({ mode }) => {
  const preview = mode === "preview";
  const e2e = mode === "e2e" || preview;
  return {
    server: { port: 5173, strictPort: true },
    resolve: {
      alias: [
        // Seam 2 replaces Clerk's browser SDK and the Mux gateway. The server still verifies real tokens.
        ...(e2e
          ? [
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
