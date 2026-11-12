import { createMiddleware } from "@tanstack/react-start";

/**
 * A phone returning from the background can hold an expired session cookie,
 * and Clerk only recovers from that on page navigations. A fresh token on
 * every server call means the call is never treated as signed out.
 */
export const bearerTokenMiddleware = createMiddleware({
  type: "function",
}).client(async ({ next }) => {
  const token = typeof window === "undefined" ? undefined : await window.Clerk?.session?.getToken();
  return next({
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
});
