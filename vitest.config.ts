import path from "node:path";
import { generateKeyPairSync } from "node:crypto";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vitest/config";

// A fresh key each run: Clerk's real verification runs against tokens the tests sign.
const clerkKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const muxKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });

export default defineConfig(async () => ({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations("./migrations"),
          TEST_CLERK_PRIVATE_JWK: JSON.stringify(clerkKeys.privateKey.export({ format: "jwk" })),
          TEST_MUX_PUBLIC_KEY: muxKeys.publicKey.export({ type: "spki", format: "pem" }).toString(),
          // Mux issues PKCS#1 keys, base64-encoded.
          TEST_MUX_PRIVATE_KEY: btoa(
            muxKeys.privateKey.export({ type: "pkcs1", format: "pem" }).toString(),
          ),
          CLERK_JWT_KEY: clerkKeys.publicKey.export({ type: "spki", format: "pem" }).toString(),
          CLERK_SECRET_KEY: "sk_test_seam1",
          CLERK_PUBLISHABLE_KEY: `pk_test_${btoa("clerk.example.test$")}`,
          // A build-time define the Vitest transform does not apply to Start's server core.
          TSS_SERVER_FN_BASE: "/_serverFn/",
          APP_ORIGIN: "https://cutnotes.test",
          TEAM_NAME: "Haithem Studio",
          TEAM_LOGO_URL: "https://cutnotes.test/logo.png",
          FIRST_OWNER_EMAIL: "first.owner@example.com",
        },
      },
    }),
    tanstackStart(),
  ],
  test: {
    // Worker/Start cold starts contend when every file boots at once.
    maxWorkers: 2,
    include: ["test/seam1/**/*.test.ts"],
    setupFiles: ["./test/seam1/support/setup.ts"],
  },
}));
