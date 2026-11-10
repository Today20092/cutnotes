/** The last Comment at or before the playback time; rows are in timecode order. */
export function activeCommentId(rows: { id: string; timecodeMs: number }[], timeMs: number) {
  return rows.findLast((row) => row.timecodeMs <= timeMs)?.id ?? null;
}
