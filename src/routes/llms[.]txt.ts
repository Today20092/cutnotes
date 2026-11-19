import { createFileRoute } from "@tanstack/react-router";
import { llmsText } from "@/lib/route-index";

// Public on purpose and static: it lists routes and params, never data.
export const Route = createFileRoute("/llms.txt")({
  server: {
    handlers: {
      GET: () =>
        new Response(llmsText(), {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "public, max-age=300",
          },
        }),
    },
  },
});
