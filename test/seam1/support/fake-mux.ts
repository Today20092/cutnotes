import type { MuxGateway } from "@/server/mux/gateway";

/** Stands in for Mux at the gateway boundary. Later tickets add a method per gateway method. */
export const fakeMux: MuxGateway = {
  signPlaybackToken: async ({ playbackId, audience }) =>
    `fake.${audience}.${playbackId}`,
};
