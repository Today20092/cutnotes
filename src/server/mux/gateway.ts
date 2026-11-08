export type PlaybackAudience = "v" | "t" | "s";

export type MuxGateway = {
  signPlaybackToken(request: {
    playbackId: string;
    audience: PlaybackAudience;
    /** Epoch seconds. */
    expiresAt: number;
    /** Options such as a thumbnail `time` travel inside the token. */
    claims?: Record<string, string | number>;
  }): Promise<string>;
  /** `url` is itself a credential: hand it to the uploader, never store or log it. */
  createDirectUpload(request: {
    corsOrigin: string;
    /** The Revision ID, echoed back on every webhook. */
    passthrough: string;
  }): Promise<{ uploadId: string; url: string }>;
  /** False when Mux will not cancel because the upload is no longer waiting. */
  cancelDirectUpload(uploadId: string): Promise<boolean>;
  /** Checks the `Mux-Signature` header against the exact bytes received. */
  verifyWebhookSignature(request: {
    rawBody: string;
    signature: string | null;
  }): Promise<boolean>;
};

const MUX_API = "https://api.mux.com/video/v1";
const WEBHOOK_TOLERANCE_SECONDS = 300;

const algorithm = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
const encoder = new TextEncoder();

const toBase64Url = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const encodeJson = (value: unknown) =>
  toBase64Url(encoder.encode(JSON.stringify(value)));

function derLength(length: number): number[] {
  if (length < 0x80) return [length];
  const bytes: number[] = [];
  for (let rest = length; rest > 0; rest = Math.floor(rest / 256)) {
    bytes.unshift(rest % 256);
  }
  return [0x80 | bytes.length, ...bytes];
}

// version 0, then AlgorithmIdentifier { rsaEncryption, NULL }.
const pkcs8Prefix = [
  0x02, 0x01, 0x00, 0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d,
  0x01, 0x01, 0x01, 0x05, 0x00,
];

/** Web Crypto only imports PKCS#8, and Mux issues PKCS#1 keys. */
function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array<ArrayBuffer> {
  const octetString = [0x04, ...derLength(pkcs1.length)];
  const bodyLength = pkcs8Prefix.length + octetString.length + pkcs1.length;
  return new Uint8Array([
    0x30,
    ...derLength(bodyLength),
    ...pkcs8Prefix,
    ...octetString,
    ...pkcs1,
  ]);
}

async function importSigningKey(base64Pem: string): Promise<CryptoKey> {
  const pem = atob(base64Pem);
  const der = Uint8Array.from(
    atob(pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, "")),
    (char) => char.charCodeAt(0),
  );
  return crypto.subtle.importKey(
    "pkcs8",
    pem.includes("BEGIN RSA PRIVATE KEY") ? pkcs1ToPkcs8(der) : der,
    algorithm,
    false,
    ["sign"],
  );
}

const fromHex = (hex: string) =>
  /^(?:[0-9a-f]{2})+$/i.test(hex)
    ? Uint8Array.from(hex.match(/../g) as string[], (byte) =>
        Number.parseInt(byte, 16),
      )
    : undefined;

function parseSignatureHeader(header: string) {
  const fields = header.split(",").map((field) => field.trim().split("="));
  return {
    timestamp: fields.find(([name]) => name === "t")?.[1],
    signatures: fields.flatMap(([name, value]) =>
      name === "v1" && value ? [value] : [],
    ),
  };
}

/** The only code that talks to Mux. `signingPrivateKey` is the base64 key Mux issues. */
export function createMuxGateway(config: {
  signingKeyId: string;
  signingPrivateKey: string;
  tokenId: string;
  tokenSecret: string;
  webhookSecret: string;
}): MuxGateway {
  let key: Promise<CryptoKey> | undefined;
  let webhookKey: Promise<CryptoKey> | undefined;

  const callMux = (path: string, method: string, body?: unknown) =>
    fetch(`${MUX_API}${path}`, {
      method,
      headers: {
        authorization: `Basic ${btoa(`${config.tokenId}:${config.tokenSecret}`)}`,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  return {
    async createDirectUpload({ corsOrigin, passthrough }) {
      const response = await callMux("/uploads", "POST", {
        cors_origin: corsOrigin,
        timeout: 86400,
        new_asset_settings: {
          playback_policies: ["signed"],
          video_quality: "basic",
          max_resolution_tier: "1080p",
          passthrough,
        },
      });
      if (!response.ok) {
        throw new Error(`Mux refused the upload: ${response.status}`);
      }
      const { data } = await response.json<{
        data: { id: string; url: string };
      }>();
      return { uploadId: data.id, url: data.url };
    },

    async cancelDirectUpload(uploadId) {
      const response = await callMux(
        `/uploads/${encodeURIComponent(uploadId)}/cancel`,
        "PUT",
      );
      if (response.ok) return true;
      if (response.status < 500) return false;
      throw new Error(`Mux could not cancel the upload: ${response.status}`);
    },

    async verifyWebhookSignature({ rawBody, signature }) {
      if (!signature) return false;
      const { timestamp, signatures } = parseSignatureHeader(signature);
      if (!timestamp || !/^\d+$/.test(timestamp)) return false;
      const age = Math.abs(Date.now() / 1000 - Number(timestamp));
      if (age > WEBHOOK_TOLERANCE_SECONDS) return false;

      webhookKey ??= crypto.subtle.importKey(
        "raw",
        encoder.encode(config.webhookSecret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"],
      );
      const signed = encoder.encode(`${timestamp}.${rawBody}`);
      for (const candidate of signatures) {
        const bytes = fromHex(candidate);
        // subtle.verify compares in constant time.
        if (
          bytes &&
          (await crypto.subtle.verify("HMAC", await webhookKey, bytes, signed))
        ) {
          return true;
        }
      }
      return false;
    },

    async signPlaybackToken({ playbackId, audience, expiresAt, claims }) {
      key ??= importSigningKey(config.signingPrivateKey);
      const unsigned = `${encodeJson({ alg: "RS256", typ: "JWT" })}.${encodeJson({
        ...claims,
        sub: playbackId,
        aud: audience,
        exp: expiresAt,
        kid: config.signingKeyId,
      })}`;
      const signature = await crypto.subtle.sign(
        algorithm,
        await key,
        encoder.encode(unsigned),
      );
      return `${unsigned}.${toBase64Url(new Uint8Array(signature))}`;
    },
  };
}
