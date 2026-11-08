export type Point = [number, number];
export type Tool = "pen" | "arrow" | "box";
export type Shape = { tool: Tool; color: string; pts: Point[] };
export const drawingColors = ["#f87171", "#fbbf24", "#4ade80", "#60a5fa", "#ffffff"] as const;

export function pictureRect(width: number, height: number, aspect: number) {
  const w = Math.min(width, height * aspect);
  const h = w / aspect;
  return { left: (width - w) / 2, top: (height - h) / 2, width: w, height: h };
}
export function picturePoint(x: number, y: number, rect: ReturnType<typeof pictureRect>): Point {
  return [Math.max(0, Math.min(1, (x - rect.left) / rect.width)), Math.max(0, Math.min(1, (y - rect.top) / rect.height))];
}

// Iterative Ramer–Douglas–Peucker avoids a deep stack on long pen strokes.
export function simplify(points: Point[], tolerance = 0.002): Point[] {
  if (points.length < 3) return points;
  const keep = new Set([0, points.length - 1]);
  const pending: [number, number][] = [[0, points.length - 1]];
  while (pending.length) {
    const [start, end] = pending.pop()!;
    const [x, y] = points[start]!;
    const dx = points[end]![0] - x, dy = points[end]![1] - y;
    let farthest = -1, distance = tolerance * tolerance;
    for (let i = start + 1; i < end; i++) {
      const [px, py] = points[i]!;
      const t = dx || dy ? Math.max(0, Math.min(1, ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy))) : 0;
      const d = (px - x - t * dx) ** 2 + (py - y - t * dy) ** 2;
      if (d > distance) { distance = d; farthest = i; }
    }
    if (farthest !== -1) { keep.add(farthest); pending.push([start, farthest], [farthest, end]); }
  }
  return points.filter((_, i) => keep.has(i));
}

export function validDrawing(value: unknown): value is Shape[] {
  if (!Array.isArray(value) || !value.length || value.length > 50) return false;
  let points = 0;
  for (const shape of value) {
    if (!shape || !["pen", "arrow", "box"].includes(shape.tool) || !drawingColors.includes(shape.color)
      || !Array.isArray(shape.pts) || shape.pts.length < (shape.tool === "pen" ? 1 : 2)) return false;
    points += shape.pts.length;
    if (points > 2000 || !shape.pts.every((p: unknown) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1))) return false;
  }
  try { return new TextEncoder().encode(JSON.stringify(value)).byteLength <= 64 * 1024; }
  catch { return false; }
}

export function readDrawing(value: string | null): Shape[] {
  if (!value) return [];
  try { const parsed: unknown = JSON.parse(value); return validDrawing(parsed) ? parsed : []; }
  catch { return []; }
}
