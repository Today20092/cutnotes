import { env } from "cloudflare:workers";

export type Person = {
  clerkUserId: string;
  email?: string;
  emailVerified?: boolean;
};

const encode = (value: unknown) =>
  base64Url(new TextEncoder().encode(JSON.stringify(value)));

const base64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/** Signs a session token as Clerk would. Clerk's real verification checks it. */
export async function sessionToken(
  person: Person,
  options: { expiresInSeconds?: number; azp?: string } = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (options.expiresInSeconds ?? 60);
  const unsigned = `${encode({ alg: "RS256", typ: "JWT", kid: "seam1" })}.${encode({
    sub: person.clerkUserId,
    sid: `sess_${person.clerkUserId}`,
    iss: "https://clerk.example.test",
    azp: options.azp ?? env.APP_ORIGIN,
    iat: exp - 120,
    nbf: exp - 120,
    exp,
    email: person.email,
    email_verified: person.emailVerified,
  })}`;
  const key = await crypto.subtle.importKey(
    "jwk",
    JSON.parse(env.TEST_CLERK_PRIVATE_JWK) as JsonWebKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
}
