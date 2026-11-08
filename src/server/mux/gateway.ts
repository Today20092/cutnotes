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
};

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

/** The only code that talks to Mux. `signingPrivateKey` is the base64 key Mux issues. */
export function createMuxGateway(config: {
  signingKeyId: string;
  signingPrivateKey: string;
}): MuxGateway {
  let key: Promise<CryptoKey> | undefined;

  return {
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
