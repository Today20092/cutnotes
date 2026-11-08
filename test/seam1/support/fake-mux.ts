import type { MuxGateway } from "@/server/mux/gateway";
import { createPlayback } from "@/server/mux/gateway";

/** What the fake accepts as a valid `Mux-Signature` for a body. */
export const fakeSignature = (rawBody: string) => `fake-${btoa(rawBody)}`;

/** Stands in for Mux at the gateway boundary, under both seams. */
export const fakeMux: MuxGateway = {
  createPlayback(request) { return createPlayback(this, request); },
  deleteAsset: async () => {},
  getAsset: async (id) => ({ id, status: "preparing" }),
  getDirectUpload: async () => ({ status: "waiting" }),
  signPlaybackToken: async ({ playbackId, audience }) =>
    `fake.${audience}.${playbackId}`,
  createDirectUpload: async ({ passthrough }) => ({
    uploadId: `upload_${passthrough}`,
    url: `https://uploads.mux.test/${passthrough}`,
  }),
  cancelDirectUpload: async () => true,
  verifyWebhookSignature: async ({ rawBody, signature }) =>
    signature === fakeSignature(rawBody),
};
