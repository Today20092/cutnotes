import { fakeMux } from "../../test/seam1/support/fake-mux";
import type { MuxGateway } from "../../src/server/mux/gateway";

const gateway: MuxGateway = {
  ...fakeMux,
  thumbnailUrl: (id) => `/__preview/thumbnail/${id}`,
  createDirectUpload: async ({ passthrough }) => ({
    uploadId: `local_${passthrough}`,
    url: `/__preview/video/${passthrough}`,
  }),
  createPlayback: async ({ playbackId }) => ({
    videoUrl: `/__preview/video/${playbackId}`,
    posterUrl: `/__preview/thumbnail/${playbackId}`,
    storyboardUrl: "",
  }),
};
export const getMuxGateway = () => gateway;
