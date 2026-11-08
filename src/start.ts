import { clerkMiddleware } from "@clerk/tanstack-react-start/server";
import { createCsrfMiddleware, createStart } from "@tanstack/react-start";
import { bearerTokenMiddleware } from "@/auth/bearer-token";

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  defaultSsr: false,
  requestMiddleware: [
    csrfMiddleware,
    clerkMiddleware(() => ({
      authorizedParties: [process.env.APP_ORIGIN as string],
    })),
  ],
  functionMiddleware: [bearerTokenMiddleware],
}));
