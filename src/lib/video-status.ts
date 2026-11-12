export const videoStatuses = ["review", "rework", "done"] as const;
export type VideoStatus = (typeof videoStatuses)[number];
