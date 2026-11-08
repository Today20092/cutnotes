import { useEffect, useRef, useState, type RefObject, type PointerEvent } from "react";
import { picturePoint, pictureRect, simplify, type Shape, type Tool } from "@/lib/drawing";

export function DrawingOverlay({ videoRef, shapes, active, tool, color, change }: {
  videoRef: RefObject<HTMLVideoElement | null>; shapes: Shape[]; active: boolean; tool: Tool; color: string; change: (shapes: Shape[]) => void;
}) {
  const [rect, setRect] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const [stroke, setStroke] = useState<Shape | null>(null);
  const pointer = useRef<number | null>(null);
  const current = useRef<Shape | null>(null);
  useEffect(() => {
    const video = videoRef.current!;
    const update = () => setRect(pictureRect(video.clientWidth, video.clientHeight, video.videoWidth / video.videoHeight || 16 / 9));
    const observer = new ResizeObserver(update);
    observer.observe(video); video.addEventListener("loadedmetadata", update); update();
    return () => { observer.disconnect(); video.removeEventListener("loadedmetadata", update); };
  }, [videoRef]);
  function point(event: PointerEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    return picturePoint(event.clientX - box.left, event.clientY - box.top, { left: 0, top: 0, width: box.width, height: box.height });
  }
  function move(event: PointerEvent<SVGSVGElement>) {
    if (pointer.current !== event.pointerId || !current.current) return;
    const pts = current.current.tool === "pen" ? [...current.current.pts, point(event)] : [current.current.pts[0]!, point(event)];
    current.current = { ...current.current, pts }; setStroke(current.current);
  }
  function cancel() { pointer.current = null; current.current = null; setStroke(null); }
  return <svg aria-label="Drawing picture" role="img" viewBox="0 0 1000 1000" preserveAspectRatio="none"
    className="absolute" style={{ ...rect, pointerEvents: active ? "auto" : "none", touchAction: "none" }}
    onPointerDown={(event) => {
      if (!active || pointer.current !== null || !event.isPrimary || event.button !== 0) return;
      event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); pointer.current = event.pointerId;
      current.current = { tool, color, pts: [point(event), point(event)] }; setStroke(current.current);
    }} onPointerMove={move} onPointerCancel={cancel} onLostPointerCapture={cancel}
    onPointerUp={(event) => {
      if (pointer.current !== event.pointerId || !current.current) return;
      move(event);
      const shape = current.current;
      change([...shapes, { ...shape, pts: shape.tool === "pen" ? simplify(shape.pts) : shape.pts }]); cancel();
    }}>
    {[...shapes, ...(stroke ? [stroke] : [])].map((shape, i) => {
      const [a, b] = [shape.pts[0]!, shape.pts[shape.pts.length - 1]!];
      const x = a[0] * 1000, y = a[1] * 1000, ex = b[0] * 1000, ey = b[1] * 1000;
      const angle = Math.atan2((ey - y) * rect.height, (ex - x) * rect.width);
      const head = (offset: number) => `${ex - Math.cos(angle + offset) * 14},${ey - Math.sin(angle + offset) * 14 * rect.width / (rect.height || 1)}`;
      return <g key={i} fill="none" stroke={shape.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ vectorEffect: "non-scaling-stroke" }}>
        {shape.tool === "box" ? <rect x={Math.min(x, ex)} y={Math.min(y, ey)} width={Math.abs(ex - x)} height={Math.abs(ey - y)} />
          : shape.tool === "pen" ? <polyline points={shape.pts.map(([px, py]) => `${px * 1000},${py * 1000}`).join(" ")} />
          : <><path d={`M${x},${y} L${ex},${ey}`} /><polyline points={`${head(-0.5)} ${ex},${ey} ${head(0.5)}`} /></>}
      </g>;
    })}
  </svg>;
}
