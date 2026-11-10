import type { Comment } from "@/server/comment-rules";

export const markerRates = [
  { label: "23.976", base: 24, ntsc: true },
  { label: "24", base: 24, ntsc: false },
  { label: "25", base: 25, ntsc: false },
  { label: "29.97", base: 30, ntsc: true },
  { label: "30", base: 30, ntsc: false },
  { label: "50", base: 50, ntsc: false },
  { label: "59.94", base: 60, ntsc: true },
  { label: "60", base: 60, ntsc: false },
] as const;
export type MarkerRate = (typeof markerRates)[number];
const xml = (value: string) =>
  value
    // XML 1.0 forbids these control characters in user-entered text.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!,
    );

export function premiereMarkers({
  title,
  revision,
  comments,
  rate,
  startTimecode,
  unresolvedOnly,
  durationMs,
}: {
  title: string;
  revision: number;
  comments: Comment[];
  rate: MarkerRate;
  startTimecode: string;
  unresolvedOnly: boolean;
  durationMs: number;
}) {
  const parts = /^(\d{2}):([0-5]\d):([0-5]\d):(\d{2})$/.exec(startTimecode);
  if (!parts || Number(parts[1]) > 23 || Number(parts[4]) >= rate.base)
    throw new Error("Enter a valid non-drop timecode: HH:MM:SS:FF.");
  const startFrame =
    (Number(parts[1]) * 3600 + Number(parts[2]) * 60 + Number(parts[3])) * rate.base +
    Number(parts[4]);
  const fps = rate.ntsc ? (rate.base * 1000) / 1001 : rate.base;
  const selected = comments
    .filter((c) => !unresolvedOnly || c.resolvedAt === null)
    .sort((a, b) => a.timecodeMs - b.timecodeMs);
  if (!selected.length) throw new Error("No comments match this export.");
  const frame = (ms: number) => Math.round((ms * fps) / 1000);
  const duration = Math.max(
    Math.ceil((durationMs * fps) / 1000),
    ...selected.map((c) => frame(c.timecodeMs) + 1),
  );
  const rateXml = `<rate><timebase>${rate.base}</timebase><ntsc>${rate.ntsc ? "TRUE" : "FALSE"}</ntsc></rate>`;
  const markers = selected
    .map(
      (c) =>
        `<marker><name>${xml(`${c.authorName}: ${c.body || "Drawing"}`)}</name><comment>${xml(`${c.body}\nAuthor: ${c.authorName}\nStatus: ${c.resolvedAt === null ? "Unresolved" : "Resolved"}${c.drawing?.length ? "\nIncludes a drawing (view in Cutnotes)." : ""}`)}</comment><in>${frame(c.timecodeMs)}</in><out>-1</out></marker>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xmeml>\n<xmeml version="5"><sequence id="cutnotes-markers"><name>${xml(`${title} — Revision ${revision} — Comments`)}</name><duration>${duration}</duration>${rateXml}<timecode>${rateXml}<string>${startTimecode}</string><frame>${startFrame}</frame><displayformat>NDF</displayformat></timecode><media><video><format><samplecharacteristics>${rateXml}<width>1920</width><height>1080</height><anamorphic>FALSE</anamorphic><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></format><track/></video></media>${markers}</sequence></xmeml>`;
}
