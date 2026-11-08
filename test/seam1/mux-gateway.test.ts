import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { getMuxGateway } from "@/server/mux";
import { createMuxGateway } from "@/server/mux/gateway";
import { fakeMux } from "./support/fake-mux";

const decode = (segment: string) =>
  Uint8Array.from(
    atob(segment.replace(/-/g, "+").replace(/_/g, "/")),
    (char) => char.charCodeAt(0),
  );

const decodeJson = (segment: string): unknown =>
  JSON.parse(new TextDecoder().decode(decode(segment)));

const publicKey = () =>
  crypto.subtle.importKey(
    "spki",
    decode(
      env.TEST_MUX_PUBLIC_KEY.replace(/-----[^-]+-----/g, "").replace(/\s/g, ""),
    ),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );

it("signs a playback token Mux can verify, using a generated key", async () => {
  const gateway = createMuxGateway({
    signingKeyId: "key-id-1",
    signingPrivateKey: env.TEST_MUX_PRIVATE_KEY,
  });

  const token = await gateway.signPlaybackToken({
    playbackId: "playback-1",
    audience: "t",
    expiresAt: 1_900_000_000,
    claims: { time: 12 },
  });

  const [header, payload, signature] = token.split(".") as [
    string,
    string,
    string,
  ];
  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    await publicKey(),
    decode(signature),
    new TextEncoder().encode(`${header}.${payload}`),
  );
  expect(verified).toBe(true);
  expect(decodeJson(header)).toMatchObject({ alg: "RS256" });
  expect(decodeJson(payload)).toEqual({
    sub: "playback-1",
    aud: "t",
    exp: 1_900_000_000,
    kid: "key-id-1",
    time: 12,
  });
});

it("gives the Worker the fake Mux gateway under Seam 1", () => {
  expect(getMuxGateway()).toBe(fakeMux);
});
