import { createSign } from "node:crypto";
import type { Page } from "@playwright/test";
import { e2eKeys } from "./keys";
import { e2ePort } from "./port";

export type Person = { clerkUserId: string; email: string };

/** Signs a session token as Clerk would. The Worker's real Clerk middleware verifies it. */
export function sessionToken(person: Person, expiresInSeconds = 3600) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "RS256", typ: "JWT", kid: "seam2" })}.${encode({
    sub: person.clerkUserId,
    sid: `sess_${person.clerkUserId}`,
    iss: "https://clerk.example.test",
    azp: `http://127.0.0.1:${e2ePort}`,
    iat: now - 10,
    nbf: now - 10,
    exp: now + expiresInSeconds,
    email: person.email,
    email_verified: true,
  })}`;
  const signature = createSign("RSA-SHA256")
    .update(unsigned)
    .sign(e2eKeys().privateKey, "base64url");
  return `${unsigned}.${signature}`;
}

export async function signInAs(page: Page, person: Person) {
  await page.addInitScript(
    (token) => localStorage.setItem("seam2-session-token", token),
    sessionToken(person),
  );
}
