/** The last Comment at or before the playback time; rows are in timecode order. */
export function activeCommentId(rows: { id: string; timecodeMs: number }[], timeMs: number) {
  return rows.findLast((row) => row.timecodeMs <= timeMs)?.id ?? null;
}

/** Preview the latest unresolved timestamp for six seconds; seeking recomputes it. */
export function playbackComments<T extends { timecodeMs: number; resolvedAt: number | null }>(
  rows: T[],
  timeMs: number,
): T[] {
  const eligible = rows.filter(
    (row) => row.resolvedAt === null && row.timecodeMs <= timeMs && timeMs - row.timecodeMs < 6000,
  );
  const latest = Math.max(...eligible.map((row) => row.timecodeMs));
  return eligible.filter((row) => row.timecodeMs === latest);
}
