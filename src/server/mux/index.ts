import { env } from "cloudflare:workers";
import { createMuxGateway, type MuxGateway } from "./gateway";

// Cached per isolate, so the imported signing key is reused.
let gateway: MuxGateway | undefined;

export function getMuxGateway(): MuxGateway {
  gateway ??= createMuxGateway({
    signingKeyId: env.MUX_SIGNING_KEY_ID,
    signingPrivateKey: env.MUX_SIGNING_PRIVATE_KEY,
    tokenId: env.MUX_TOKEN_ID,
    tokenSecret: env.MUX_TOKEN_SECRET,
    webhookSecret: env.MUX_WEBHOOK_SECRET,
  });
  return gateway;
}
