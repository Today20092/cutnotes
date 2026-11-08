import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

// Public on purpose: the sign-in screen shows the Team before anyone is known.
export const Route = createFileRoute("/api/team")({
  server: {
    handlers: {
      GET: () =>
        Response.json({ name: env.TEAM_NAME, logoUrl: env.TEAM_LOGO_URL }),
    },
  },
});
