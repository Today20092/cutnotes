// PROTOTYPE, throwaway. Shared player, drawing layer, timeline and comment parts. All data is in memory.
import { useEffect, useRef, useState, type PointerEvent as RPE } from "react";
import { ArrowUpRight, Check, Maximize, Pause, PenLine, Pencil, Play, Send, Square, Undo2, X } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

export const DURATION = 1122;
export type Tool = "pen" | "arrow" | "box";
export type Shape = { tool: Tool; color: string; pts: [number, number][] };
export type Comment = {
  id: number; author: string; guest?: boolean; t: number; text: string; resolved?: boolean; shapes?: Shape[];
};
const COLORS = ["#f87171", "#fbbf24", "#4ade80", "#60a5fa", "#ffffff"];
export const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

const SEED: Comment[] = [
  { id: 1, author: "Haithem", t: 42, text: "Open on the wide shot. This close-up feels too early." },
  { id: 2, author: "Ayoub", t: 186, text: "Skin tones drift here. Is this the graded clip?", shapes: [{ tool: "box", color: "#fbbf24", pts: [[620, 170], [980, 560]] }] },
  { id: 3, author: "Sam", guest: true, t: 251, text: "The story loses me for a moment around here." },
  { id: 4, author: "Haithem", t: 408, text: "Cut this whole section down by about 20 seconds.", resolved: true },
  { id: 5, author: "Ayoub", t: 655, text: "Lower third covers the logo.", shapes: [{ tool: "arrow", color: "#f87171", pts: [[420, 300], [770, 690]] }] },
  { id: 6, author: "Haithem", t: 903, text: "Music is too loud under the interview." },
];

export function useReview() {
  const [t, setT] = useState(186);
  const [playing, setPlaying] = useState(false);
  const [comments, setComments] = useState(SEED);
  const [activeId, setActiveId] = useState<number | null>(2);
  const [drawing, setDrawing] = useState(false);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [author, setAuthor] = useState({ name: "Ayoub", guest: false });

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setT((v) => (v + 0.25 >= DURATION ? 0 : v + 0.25)), 250);
    return () => clearInterval(id);
  }, [playing]);

  return {
    t, playing, comments, activeId, drawing, shapes, tool, color, author,
    setTool, setColor, setAuthor, setShapes,
    active: comments.find((c) => c.id === activeId) ?? null,
    togglePlay: () => { setDrawing(false); setActiveId(null); setPlaying((p) => !p); },
    seek: (v: number) => { setT(v); setActiveId(null); },
    startDraw: () => { setPlaying(false); setActiveId(null); setDrawing(true); },
    stopDraw: () => { setDrawing(false); setShapes([]); },
    select: (c: Comment) => { setPlaying(false); setDrawing(false); setT(c.t); setActiveId(c.id); },
    resolve: (id: number) => setComments((all) => all.map((c) => (c.id === id ? { ...c, resolved: !c.resolved } : c))),
    send: (text: string) => {
      const c: Comment = { id: Date.now(), author: author.name, guest: author.guest, t, text, shapes: shapes.length ? shapes : undefined };
      setComments((all) => [...all, c].sort((a, b) => a.t - b.t));
      setActiveId(c.id); setDrawing(false); setShapes([]);
    },
  };
}
export type Review = ReturnType<typeof useReview>;

function ShapeView({ s, draft }: { s: Shape; draft?: boolean }) {
  const [a, b] = [s.pts[0], s.pts[s.pts.length - 1]];
  const props = { stroke: s.color, strokeWidth: 8, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const, opacity: draft ? 0.95 : 1 };
  if (s.tool === "pen") return <polyline {...props} points={s.pts.map((p) => p.join(",")).join(" ")} />;
  if (s.tool === "box") return <rect {...props} x={Math.min(a[0], b[0])} y={Math.min(a[1], b[1])} width={Math.abs(b[0] - a[0])} height={Math.abs(b[1] - a[1])} />;
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const h = (d: number) => `${b[0] - 42 * Math.cos(ang + d)},${b[1] - 42 * Math.sin(ang + d)}`;
  return <g><line {...props} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} /><polyline {...props} points={`${h(0.5)} ${b.join(",")} ${h(-0.5)}`} /></g>;
}

function Scene({ t }: { t: number }) {
  const shift = Math.sin(t / 40) * 12;
  return (
    <svg viewBox="0 0 1600 900" className="absolute inset-0 size-full" aria-hidden>
      <rect width="1600" height="900" fill="#17202b" />
      <rect x={150 + shift} y="120" width="420" height="560" fill="#223244" />
      <rect x={1040 - shift} y="70" width="360" height="620" fill="#2b2a33" />
      <circle cx={1240 - shift} cy="210" r="70" fill="#d9a35b" opacity=".75" />
      <rect y="690" width="1600" height="210" fill="#10161e" />
      <ellipse cx={800 + shift} cy="830" rx="290" ry="340" fill="#39475a" />
      <circle cx={800 + shift} cy="350" r="150" fill="#b98a6e" />
      <path d={`M${650 + shift} 340a150 150 0 0 1 300 0q-150-110-300 0`} fill="#20262f" />
      <text x="60" y="845" fill="#ffffff" opacity=".55" fontSize="38" fontFamily="monospace">SAMPLE PICTURE · {fmt(t)}</text>
    </svg>
  );
}

export function Player({ r, className }: { r: Review; className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const live = useRef<Shape | null>(null);
  const [, tick] = useState(0);
  const point = (e: RPE): [number, number] => {
    const b = ref.current!.getBoundingClientRect();
    return [((e.clientX - b.left) / b.width) * 1600, ((e.clientY - b.top) / b.height) * 900];
  };
  const shown = r.drawing ? r.shapes : (r.active?.shapes ?? []);
  return (
    <div className={cn("dark relative aspect-video w-full max-w-full overflow-hidden bg-black text-white", className)}>
      <Scene t={r.t} />
      <svg
        ref={ref} viewBox="0 0 1600 900" className={cn("absolute inset-0 size-full", r.drawing ? "cursor-crosshair touch-none" : "pointer-events-none")}
        onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); live.current = { tool: r.tool, color: r.color, pts: [point(e)] }; tick((n) => n + 1); }}
        onPointerMove={(e) => { if (!live.current) return; if (r.tool === "pen") live.current.pts.push(point(e)); else live.current.pts[1] = point(e); tick((n) => n + 1); }}
        onPointerUp={() => { const s = live.current; live.current = null; if (s && s.pts.length > 1) r.setShapes([...r.shapes, s]); tick((n) => n + 1); }}
      >
        {shown.map((s, i) => <ShapeView key={i} s={s} />)}
        {live.current && <ShapeView s={live.current} draft />}
      </svg>
      {!r.drawing && (
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-black/55 p-1">
          <Button size="icon" variant="ghost" className="size-10" aria-label={r.playing ? "Pause" : "Play"} onClick={r.togglePlay}>
            {r.playing ? <Pause /> : <Play />}
          </Button>
          <span className="font-mono text-xs tabular-nums">{fmt(r.t)} / {fmt(DURATION)}</span>
          <span className="flex-1" />
          <Button size="sm" variant="secondary" className="h-9" onClick={r.startDraw}><PenLine /> Draw</Button>
          <Button size="icon" variant="ghost" className="size-10" aria-label="Full screen"><Maximize /></Button>
        </div>
      )}
    </div>
  );
}

export function DrawBar({ r }: { r: Review }) {
  if (!r.drawing) return null;
  return (
    <div className="dark flex flex-wrap items-center gap-2 bg-neutral-900 p-2 text-white">
      <ToggleGroup value={[r.tool]} onValueChange={(v: string[]) => v[0] && r.setTool(v[0] as Tool)} aria-label="Drawing tool">
        <ToggleGroupItem value="pen" aria-label="Pen"><Pencil /></ToggleGroupItem>
        <ToggleGroupItem value="arrow" aria-label="Arrow"><ArrowUpRight /></ToggleGroupItem>
        <ToggleGroupItem value="box" aria-label="Box"><Square /></ToggleGroupItem>
      </ToggleGroup>
      <div className="flex gap-1">
        {COLORS.map((c) => (
          <button key={c} aria-label={`Colour ${c}`} onClick={() => r.setColor(c)} className="flex size-9 items-center justify-center">
            <span className={cn("size-6 rounded-full border border-white/30", r.color === c && "ring-2 ring-white ring-offset-2 ring-offset-neutral-900")} style={{ background: c }} />
          </button>
        ))}
      </div>
      <span className="flex-1" />
      <Button size="icon" variant="ghost" className="size-9" aria-label="Undo" disabled={!r.shapes.length} onClick={() => r.setShapes(r.shapes.slice(0, -1))}><Undo2 /></Button>
      <Button size="icon" variant="ghost" className="size-9" aria-label="Cancel drawing" onClick={r.stopDraw}><X /></Button>
    </div>
  );
}

export function Timeline({ r, tall }: { r: Review; tall?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const scrub = (e: RPE) => { const b = ref.current!.getBoundingClientRect(); r.seek(Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)) * DURATION); };
  return (
    <div
      ref={ref} role="slider" aria-label="Timeline" aria-valuemin={0} aria-valuemax={DURATION} aria-valuenow={Math.round(r.t)} tabIndex={0}
      className={cn("relative w-full cursor-pointer touch-none bg-neutral-950", tall ? "h-14" : "h-9")}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); scrub(e); }}
      onPointerMove={(e) => { if (e.buttons || e.pressure > 0) scrub(e); }}
    >
      <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 bg-white/25" />
      <div className="absolute left-0 top-1/2 h-1 -translate-y-1/2 bg-white" style={{ width: `${(r.t / DURATION) * 100}%` }} />
      {r.comments.map((c) => (
        <button
          key={c.id} aria-label={`Comment at ${fmt(c.t)}`} onPointerDown={(e) => e.stopPropagation()} onClick={() => r.select(c)}
          className="absolute top-0 flex h-full w-6 -translate-x-1/2 items-center justify-center" style={{ left: `${(c.t / DURATION) * 100}%` }}
        >
          <span className={cn("rounded-full", tall ? "size-3.5" : "size-2.5", c.resolved ? "bg-neutral-500" : "bg-amber-400", r.activeId === c.id && "ring-2 ring-white")} />
        </button>
      ))}
      <div className="absolute top-1 bottom-1 w-0.5 bg-white" style={{ left: `${(r.t / DURATION) * 100}%` }} />
    </div>
  );
}

export function CommentRow({ c, r, check, canResolve = true }: { c: Comment; r: Review; check?: boolean; canResolve?: boolean }) {
  return (
    <div className={cn("flex gap-3 border-b p-3 text-left", r.activeId === c.id && "bg-muted", c.resolved && "opacity-60")}>
      {check ? (
        <button aria-label={c.resolved ? "Reopen" : "Resolve"} onClick={() => r.resolve(c.id)} className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2", c.resolved && "border-primary bg-primary text-primary-foreground")}>
          {c.resolved && <Check className="size-3.5" />}
        </button>
      ) : (
        <Avatar className="size-8"><AvatarFallback>{c.author[0]}</AvatarFallback></Avatar>
      )}
      <button className="min-w-0 flex-1 text-left" onClick={() => r.select(c)}>
        <span className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">{c.author}</span>
          {c.guest && <Badge variant="outline">Guest</Badge>}
          <span className="font-mono text-xs text-muted-foreground tabular-nums">{fmt(c.t)}</span>
          {c.shapes && <PenLine className="size-3.5 text-muted-foreground" aria-label="Has a drawing" />}
        </span>
        <span className="mt-1 block text-sm leading-snug">{c.text}</span>
      </button>
      {!check && canResolve && (
        <Button size="icon" variant="ghost" className="size-9 shrink-0" aria-label={c.resolved ? "Reopen" : "Resolve"} onClick={() => r.resolve(c.id)}>
          <Check className={c.resolved ? "text-primary" : "text-muted-foreground"} />
        </Button>
      )}
    </div>
  );
}

export function Composer({ r, askName, onFocus }: { r: Review; askName?: boolean; onFocus?: () => void }) {
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const submit = () => {
    if (!text.trim() || (askName && !name.trim())) return;
    if (askName) r.setAuthor({ name: name.trim(), guest: true });
    r.send(text.trim()); setText("");
  };
  return (
    <form className="flex flex-col gap-2 border-t bg-background p-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      {askName && <Input id="guest-name" aria-label="Your name" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} className="h-10 text-base md:text-sm" />}
      <div className="flex items-center gap-2">
        <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">{fmt(r.t)}</span>
        <Input id="comment" aria-label="Comment" placeholder={r.shapes.length ? "Describe your drawing" : "Add a comment"} value={text} onFocus={onFocus} onChange={(e) => setText(e.target.value)} className="h-10 min-w-0 flex-1 text-base md:text-sm" />
        <Button type="submit" size="icon" className="size-10 shrink-0" aria-label="Send comment" disabled={!text.trim()}><Send /></Button>
      </div>
    </form>
  );
}
