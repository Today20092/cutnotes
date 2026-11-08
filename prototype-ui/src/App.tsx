// PROTOTYPE, throwaway. Three layouts: A Clean list, B Visual, C To-do. Variant and screen live in the URL hash.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, CircleUser, Clapperboard, Copy, Film, FolderOpen, Plus, Share2, Upload, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider } from "@/components/ui/sidebar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { CommentRow, Composer, DrawBar, Player, Timeline, fmt, useReview, type Review } from "./review";

type Screen = "projects" | "review" | "guest";
const VARIANTS = { a: "Clean list", b: "Visual", c: "To-do" } as const;
type V = keyof typeof VARIANTS;
const SCREENS: [Screen, string][] = [["projects", "Projects"], ["review", "Review"], ["guest", "Guest"]];
type Item = { project: string; video: string; rev: number; status: "Review" | "Rework" | "Done"; open: number; updated: string; hue: number };
const ITEMS: Item[] = [
  { project: "Episode 42", video: "Main cut", rev: 3, status: "Review", open: 5, updated: "12 min ago", hue: 210 },
  { project: "Episode 42", video: "Shorts pack", rev: 1, status: "Review", open: 2, updated: "1 hr ago", hue: 30 },
  { project: "Ramadan Special", video: "Trailer", rev: 2, status: "Rework", open: 7, updated: "Yesterday", hue: 280 },
  { project: "Interview: Dr. Salem", video: "Full episode", rev: 4, status: "Rework", open: 1, updated: "Yesterday", hue: 150 },
  { project: "Channel Intro", video: "15 second bumper", rev: 2, status: "Done", open: 0, updated: "3 days ago", hue: 350 },
];

function readHash(): { v: V; s: Screen } {
  const [v, s] = location.hash.slice(1).split("-");
  return { v: v in VARIANTS ? (v as V) : "a", s: SCREENS.some(([k]) => k === s) ? (s as Screen) : "projects" };
}

function StatusBadge({ s }: { s: Item["status"] }) {
  return <Badge variant={s === "Review" ? "default" : s === "Rework" ? "secondary" : "outline"}>{s}</Badge>;
}
function Thumb({ i, className }: { i: Item; className?: string }) {
  return <div className={cn("flex items-end justify-end bg-neutral-800 p-1", className)} style={{ background: `hsl(${i.hue} 28% 26%)` }}><span className="bg-black/60 px-1 font-mono text-[10px] text-white">18:42</span></div>;
}

function Shell({ go, children, title, action }: { go: (s: Screen) => void; children: ReactNode; title: string; action?: ReactNode }) {
  const nav = [{ label: "Projects", icon: FolderOpen }, { label: "Members", icon: Users }, { label: "Account", icon: CircleUser }];
  return (
    <SidebarProvider className="relative min-h-0 flex-1 overflow-hidden">
      <Sidebar collapsible="icon" className="absolute h-full">
        <SidebarHeader><div className="flex items-center gap-2 p-1 font-semibold"><Clapperboard className="size-5" /> <span className="group-data-[collapsible=icon]:hidden">Cutnotes</span></div></SidebarHeader>
        <SidebarContent><SidebarGroup><SidebarMenu>
          {nav.map((n, i) => <SidebarMenuItem key={n.label}><SidebarMenuButton isActive={i === 0} onClick={() => go("projects")}><n.icon /> <span>{n.label}</span></SidebarMenuButton></SidebarMenuItem>)}
        </SidebarMenu></SidebarGroup></SidebarContent>
        <SidebarFooter><div className="p-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">Haithem Studio</div></SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-h-0 min-w-0">
        <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <h1 className="truncate text-lg font-semibold">{title}</h1>{action}
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
        <nav aria-label="Main" className="grid shrink-0 grid-cols-3 border-t md:hidden">
          {nav.map((n, i) => <button key={n.label} onClick={() => go("projects")} className={cn("flex h-14 flex-col items-center justify-center gap-0.5 text-xs", i === 0 ? "text-foreground" : "text-muted-foreground")}><n.icon className="size-5" />{n.label}</button>)}
        </nav>
      </SidebarInset>
    </SidebarProvider>
  );
}

const NewBtn = () => <Button><Plus /> <span>New project</span></Button>;

function ProjectsA({ go }: { go: (s: Screen) => void }) {
  return (
    <Shell go={go} title="Projects" action={<NewBtn />}>
      <div className="hidden md:block"><Table>
        <TableHeader><TableRow><TableHead className="pl-4">Video</TableHead><TableHead>Project</TableHead><TableHead>Status</TableHead><TableHead>Open comments</TableHead><TableHead>Updated</TableHead></TableRow></TableHeader>
        <TableBody>{ITEMS.map((i) => (
          <TableRow key={i.project + i.video} className="cursor-pointer" onClick={() => go("review")}>
            <TableCell className="pl-4 font-medium"><span className="flex items-center gap-3"><Thumb i={i} className="h-9 w-16" />{i.video} <span className="font-mono text-xs text-muted-foreground">R{i.rev}</span></span></TableCell>
            <TableCell>{i.project}</TableCell><TableCell><StatusBadge s={i.status} /></TableCell><TableCell className="tabular-nums">{i.open}</TableCell><TableCell className="text-muted-foreground">{i.updated}</TableCell>
          </TableRow>))}</TableBody>
      </Table></div>
      <div className="md:hidden">{ITEMS.map((i) => (
        <button key={i.project + i.video} onClick={() => go("review")} className="flex w-full items-center gap-3 border-b p-3 text-left active:bg-muted">
          <Thumb i={i} className="h-12 w-20 shrink-0" />
          <span className="min-w-0 flex-1"><span className="block truncate font-medium">{i.video}</span><span className="block truncate text-sm text-muted-foreground">{i.project} · {i.open} open</span></span>
          <StatusBadge s={i.status} />
        </button>))}</div>
    </Shell>
  );
}
function ProjectsB({ go }: { go: (s: Screen) => void }) {
  return (
    <Shell go={go} title="Projects" action={<div className="flex shrink-0 gap-2"><Button variant="outline"><Plus /> New project</Button><Button><Upload /> Upload</Button></div>}>
      <div className="grid grid-cols-1 gap-x-4 gap-y-6 p-4 sm:grid-cols-2 xl:grid-cols-3">{ITEMS.map((i) => (
        <button key={i.project + i.video} onClick={() => go("review")} className="min-w-0 text-left">
          <Thumb i={i} className="aspect-video w-full" />
          <span className="mt-2 flex items-start justify-between gap-2"><span className="min-w-0"><span className="block truncate font-medium">{i.video}</span><span className="block truncate text-sm text-muted-foreground">{i.project} · Revision {i.rev} · {i.updated}</span></span><StatusBadge s={i.status} /></span>
        </button>))}</div>
    </Shell>
  );
}
function ProjectsC({ go }: { go: (s: Screen) => void }) {
  const groups: [string, Item["status"]][] = [["Waiting for your review", "Review"], ["Back with the editor", "Rework"], ["Approved", "Done"]];
  return (
    <Shell go={go} title="What needs you" action={<NewBtn />}>
      <div className="mx-auto flex max-w-3xl flex-col gap-6 p-4">{groups.map(([label, s]) => (
        <section key={s}><h2 className="mb-1 text-sm font-medium text-muted-foreground">{label}</h2>
          <div className="border-y">{ITEMS.filter((i) => i.status === s).map((i) => (
            <button key={i.project + i.video} onClick={() => go("review")} className="flex w-full items-center justify-between gap-3 border-b p-3 text-left last:border-b-0 active:bg-muted">
              <span className="min-w-0"><span className="block truncate font-medium">{i.project}: {i.video}</span><span className="block text-sm text-muted-foreground">Revision {i.rev} · {i.updated}</span></span>
              <span className="shrink-0 text-right text-2xl font-semibold tabular-nums">{i.open}<span className="block text-xs font-normal text-muted-foreground">open</span></span>
            </button>))}</div>
        </section>))}</div>
    </Shell>
  );
}

function ReviewHeader({ go, guest, r }: { go: (s: Screen) => void; guest?: boolean; r: Review }) {
  const [copied, setCopied] = useState(false);
  return (
    <header className="flex shrink-0 items-center gap-1 border-b px-1 py-1">
      {guest ? <span className="flex items-center gap-2 pl-2 pr-1"><Clapperboard className="size-5" /></span> : <Button size="icon" variant="ghost" className="size-10" aria-label="Back to projects" onClick={() => go("projects")}><ChevronLeft /></Button>}
      <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">Episode 42: Main cut</div><div className="text-xs text-muted-foreground">Revision 3 of 3 · {r.comments.filter((c) => !c.resolved).length} open</div></div>
      {!guest && <><Badge>Review</Badge><Button size="sm" variant="outline" className="ml-1 h-9" onClick={() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Copy /> : <Share2 />}<span className="hidden sm:inline">{copied ? "Link copied" : "Share"}</span></Button></>}
    </header>
  );
}

function ReviewA({ r, go, guest, canResolve = true, composer }: Rv) {
  return (
    <div className="flex min-h-0 flex-1 flex-col"><ReviewHeader go={go} guest={guest} r={r} />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="flex shrink-0 flex-col bg-black md:min-w-0 md:flex-1 md:justify-center"><Player r={r} className="md:mx-auto md:w-[min(100%,calc((100dvh-10rem)*16/9))]" /><Timeline r={r} /><DrawBar r={r} /></div>
        <aside className="flex min-h-0 flex-1 flex-col md:w-96 md:flex-none md:border-l">
          <div className="min-h-0 flex-1 overflow-y-auto">{r.comments.map((c) => <CommentRow key={c.id} c={c} r={r} canResolve={canResolve} />)}</div>{composer}
        </aside>
      </div>
    </div>
  );
}
function ReviewB({ r, go, guest, canResolve = true, composer }: Rv) {
  const i = Math.max(0, r.comments.findIndex((c) => c.id === r.activeId));
  const c = r.comments[i];
  const step = (d: number) => r.select(r.comments[(i + d + r.comments.length) % r.comments.length]);
  return (
    <div className="flex min-h-0 flex-1 flex-col"><ReviewHeader go={go} guest={guest} r={r} />
      <div className="flex shrink-0 flex-col bg-black"><Player r={r} className="mx-auto md:w-[min(100%,calc(58dvh*16/9))]" /><Timeline r={r} tall /><DrawBar r={r} /></div>
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col justify-center overflow-y-auto">
        <div className="flex items-center justify-between px-2 pt-2 text-sm text-muted-foreground">
          <Button size="icon" variant="outline" className="size-10" aria-label="Previous comment" onClick={() => step(-1)}><ChevronLeft /></Button>
          <span className="tabular-nums">Comment {i + 1} of {r.comments.length}</span>
          <Button size="icon" variant="outline" className="size-10" aria-label="Next comment" onClick={() => step(1)}><ChevronRight /></Button>
        </div>
        <CommentRow c={c} r={r} canResolve={canResolve} />
      </div>
      <div className="mx-auto w-full max-w-3xl">{composer}</div>
    </div>
  );
}
function ReviewC({ r, go, guest, canResolve = true, composer }: Rv) {
  const [tab, setTab] = useState("open");
  const list = useMemo(() => r.comments.filter((c) => (tab === "open" ? !c.resolved : c.resolved)), [r.comments, tab]);
  return (
    <div className="flex min-h-0 flex-1 flex-col"><ReviewHeader go={go} guest={guest} r={r} />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row-reverse">
        <div className="flex shrink-0 flex-col bg-black md:min-w-0 md:flex-1 md:justify-center"><Player r={r} className="md:mx-auto md:w-[min(100%,calc((100dvh-10rem)*16/9))]" /><Timeline r={r} /><DrawBar r={r} /></div>
        <aside className="flex min-h-0 flex-1 flex-col md:w-96 md:flex-none md:border-r">
          <Tabs value={tab} onValueChange={setTab} className="border-b p-2"><TabsList className="w-full"><TabsTrigger value="open">To do ({r.comments.filter((c) => !c.resolved).length})</TabsTrigger><TabsTrigger value="done">Resolved ({r.comments.filter((c) => c.resolved).length})</TabsTrigger></TabsList></Tabs>
          <div className="min-h-0 flex-1 overflow-y-auto">{list.map((c) => <CommentRow key={c.id} c={c} r={r} check={canResolve} canResolve={canResolve} />)}{!list.length && <p className="p-6 text-center text-sm text-muted-foreground">Nothing here.</p>}</div>{composer}
        </aside>
      </div>
    </div>
  );
}
type Rv = { r: Review; go: (s: Screen) => void; guest?: boolean; canResolve?: boolean; composer: ReactNode };
const REVIEW = { a: ReviewA, b: ReviewB, c: ReviewC };

function NameForm({ onDone, title }: { onDone: (n: string) => void; title?: boolean }) {
  const [n, setN] = useState("");
  return (
    <form className="flex w-full max-w-sm flex-col gap-3" onSubmit={(e) => { e.preventDefault(); if (n.trim()) onDone(n.trim()); }}>
      {title && <><h2 className="text-2xl font-semibold text-balance">Haithem Studio wants your opinion</h2><p className="text-sm text-muted-foreground">Episode 42: Main cut. No account needed. You can comment and draw on the video.</p></>}
      <Input id="welcome-name" aria-label="Your name" placeholder="Your name" autoFocus value={n} onChange={(e) => setN(e.target.value)} className="h-11 text-base md:text-sm" />
      <Button type="submit" className="h-11" disabled={!n.trim()}><Film /> {title ? "Start watching" : "Continue"}</Button>
    </form>
  );
}
function Guest({ v, r, go }: { v: V; r: Review; go: (s: Screen) => void }) {
  const [name, setName] = useState("");
  const [ask, setAsk] = useState(false);
  useEffect(() => { if (name) r.setAuthor({ name, guest: true }); }, [name]);
  const Comp = REVIEW[v];
  if (v === "c" && !name) return <div className="flex flex-1 items-center justify-center overflow-y-auto p-6"><NameForm title onDone={setName} /></div>;
  const composer = v === "b" && !name ? <Composer r={r} askName /> : <Composer r={r} onFocus={v === "a" && !name ? () => setAsk(true) : undefined} />;
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <Comp r={r} go={go} guest canResolve={false} composer={composer} />
      {ask && !name && <div className="absolute inset-0 z-10 flex items-end justify-center bg-black/50 md:items-center"><div className="flex w-full max-w-sm flex-col gap-2 bg-background p-4"><h2 className="font-semibold">What name should we show?</h2><p className="text-sm text-muted-foreground">No account needed.</p><NameForm onDone={setName} /></div></div>}
    </div>
  );
}

export default function App() {
  const [{ v, s }, set] = useState(readHash);
  const member = useReview();
  const guest = useReview();
  useEffect(() => { const f = () => set(readHash()); addEventListener("hashchange", f); return () => removeEventListener("hashchange", f); }, []);
  const nav = (nv: V, ns: Screen) => { location.hash = `${nv}-${ns}`; set({ v: nv, s: ns }); };
  const keys = Object.keys(VARIANTS) as V[];
  const cycle = (d: number) => nav(keys[(keys.indexOf(v) + d + 3) % 3], s);
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if ((e.target as Element).matches("input,textarea,[contenteditable]")) return; if (e.key === "ArrowLeft") cycle(-1); if (e.key === "ArrowRight") cycle(1); };
    addEventListener("keydown", f); return () => removeEventListener("keydown", f);
  });
  const go = (ns: Screen) => nav(v, ns);
  const Projects = { a: ProjectsA, b: ProjectsB, c: ProjectsC }[v];
  const Comp = REVIEW[v];
  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 items-center gap-1 bg-fuchsia-700 px-1 text-xs text-white" aria-label="Mockup controls">
        <button className="flex size-9 items-center justify-center" aria-label="Previous layout" onClick={() => cycle(-1)}><ChevronLeft className="size-4" /></button>
        <span className="w-[5.5rem] text-center font-medium">{v.toUpperCase()}: {VARIANTS[v]}</span>
        <button className="flex size-9 items-center justify-center" aria-label="Next layout" onClick={() => cycle(1)}><ChevronRight className="size-4" /></button>
        <span className="flex-1" />
        {SCREENS.map(([k, l]) => <button key={k} onClick={() => go(k)} className={cn("h-9 px-2", s === k && "font-bold underline underline-offset-4")}>{l}</button>)}
      </div>
      {s === "projects" && <Projects go={go} />}
      {s === "review" && <Comp r={member} go={go} composer={<Composer r={member} />} />}
      {s === "guest" && <Guest key={v} v={v} r={guest} go={go} />}
    </div>
  );
}
