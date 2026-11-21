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
/** Non-drop timecode, using the same frame rounding as marker exports. */
function timecode(ms: number, frameRate: number | null) {
  const fps = frameRate || 30;
  const base = Math.round(fps);
  const frame = Math.round((ms * fps) / 1000);
  const seconds = Math.floor(frame / base);
  return [Math.floor(seconds / 60), seconds % 60, frame % base] as const;
}

export function frameTime(ms: number, frameRate: number | null) {
  const [minutes, seconds, frames] = timecode(ms, frameRate);
  return `${minutes}:${String(seconds).padStart(2, "0")}:${String(frames).padStart(2, "0")}`;
}

export function spokenFrameTime(ms: number, frameRate: number | null) {
  const [minutes, seconds, frames] = timecode(ms, frameRate);
  return `${minutes ? `${minutes} min ` : ""}${seconds} sec, frame ${frames}`;
}
