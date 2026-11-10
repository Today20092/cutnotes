import { fakeMux } from "../../test/seam1/support/fake-mux";

// Replaces `@/server/mux` under Seam 2, so both seams share one fake gateway.
export const getMuxGateway = () => fakeMux;
