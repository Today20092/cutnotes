import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    tokenId: "token-id",
    tokenSecret: "token-secret",
    webhookSecret: "webhook-secret",
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

const realGateway = () =>
  createMuxGateway({
    signingKeyId: "key-id-1",
    signingPrivateKey: env.TEST_MUX_PRIVATE_KEY,
    tokenId: "token-id",
    tokenSecret: "token-secret",
    webhookSecret: "webhook-secret",
  });

describe("direct uploads", () => {
  afterEach(() => vi.restoreAllMocks());

  it("asks Mux for a signed-only upload with the spec's settings", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json(
        { data: { id: "upload-1", url: "https://storage.example/put" } },
        { status: 201 },
      ),
    );

    const upload = await realGateway().createDirectUpload({
      corsOrigin: "https://cutnotes.test",
      passthrough: "revision-1",
    });

    expect(upload).toEqual({
      uploadId: "upload-1",
      url: "https://storage.example/put",
    });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.mux.com/video/v1/uploads");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("authorization")).toBe(
      `Basic ${btoa("token-id:token-secret")}`,
    );
    expect(JSON.parse(init.body as string)).toEqual({
      cors_origin: "https://cutnotes.test",
      timeout: 86400,
      new_asset_settings: {
        playback_policies: ["signed"],
        video_quality: "basic",
        max_resolution_tier: "1080p",
        passthrough: "revision-1",
      },
    });
  });

  it("raises when Mux refuses to create an upload", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 500 }),
    );

    await expect(
      realGateway().createDirectUpload({
        corsOrigin: "https://cutnotes.test",
        passthrough: "revision-1",
      }),
    ).rejects.toThrow();
  });

  it("cancels a waiting upload", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ data: {} }));

    expect(await realGateway().cancelDirectUpload("upload-1")).toBe(true);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.mux.com/video/v1/uploads/upload-1/cancel");
    expect(init.method).toBe("PUT");
  });

  it("reports an upload that is no longer waiting as not cancelled", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 400 }),
    );

    expect(await realGateway().cancelDirectUpload("upload-1")).toBe(false);
  });
});

describe("webhook signatures", () => {
  const rawBody = '{"type":"video.asset.ready"}';

  async function sign(timestamp: string, body: string, secret = "webhook-secret") {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${timestamp}.${body}`),
    );
    return Array.from(new Uint8Array(signature), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  }

  const nowSeconds = () => Math.floor(Date.now() / 1000);
  const verify = (signature: string | null, body = rawBody) =>
    realGateway().verifyWebhookSignature({ rawBody: body, signature });

  it("accepts Mux's signature over the timestamp and raw body", async () => {
    const t = String(nowSeconds());

    expect(await verify(`t=${t},v1=${await sign(t, rawBody)}`)).toBe(true);
  });

  it("accepts a header carrying a rotated signature as well", async () => {
    const t = String(nowSeconds());
    const header = `t=${t},v1=${"0".repeat(64)},v1=${await sign(t, rawBody)}`;

    expect(await verify(header)).toBe(true);
  });

  it("refuses a body changed by one character", async () => {
    const t = String(nowSeconds());

    expect(
      await verify(`t=${t},v1=${await sign(t, rawBody)}`, `${rawBody} `),
    ).toBe(false);
  });

  it("refuses a signature made with another secret", async () => {
    const t = String(nowSeconds());

    expect(await verify(`t=${t},v1=${await sign(t, rawBody, "other")}`)).toBe(
      false,
    );
  });

  it.each([
    ["older", -301],
    ["newer", 301],
  ])("refuses a timestamp more than 5 minutes %s", async (_label, offset) => {
    const t = String(nowSeconds() + offset);

    expect(await verify(`t=${t},v1=${await sign(t, rawBody)}`)).toBe(false);
  });

  it("accepts a timestamp inside the 5-minute tolerance", async () => {
    const t = String(nowSeconds() - 290);

    expect(await verify(`t=${t},v1=${await sign(t, rawBody)}`)).toBe(true);
  });

  it.each([
    ["missing", null],
    ["empty", ""],
    ["malformed", "nonsense"],
    ["without a signature", `t=${Math.floor(Date.now() / 1000)}`],
    ["with non-hex", `t=${Math.floor(Date.now() / 1000)},v1=zz`],
  ])("refuses a header that is %s", async (_label, header) => {
    expect(await verify(header)).toBe(false);
  });
});

it("gives the Worker the fake Mux gateway under Seam 1", () => {
  expect(getMuxGateway()).toBe(fakeMux);
});
