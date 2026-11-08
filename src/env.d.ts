declare namespace Cloudflare {
  interface GlobalProps {
    mainModule: typeof import("./server");
  }
  interface Env {
    DB: D1Database;
    APP_ORIGIN: string;
    TEAM_NAME: string;
    TEAM_LOGO_URL: string;
    FIRST_OWNER_EMAIL: string;
    MUX_SIGNING_KEY_ID: string;
    MUX_SIGNING_PRIVATE_KEY: string;
    MUX_TOKEN_ID: string;
    MUX_TOKEN_SECRET: string;
    MUX_WEBHOOK_SECRET: string;
    // Seam 1 only.
    TEST_MIGRATIONS: D1Migration[];
    TEST_CLERK_PRIVATE_JWK: string;
    TEST_MUX_PUBLIC_KEY: string;
    TEST_MUX_PRIVATE_KEY: string;
  }
}
type Env = Cloudflare.Env;

interface D1Migration {
  name: string;
  queries: string[];
}

interface Window {
  Clerk?: { session?: { getToken(): Promise<string | null> } | null };
}
