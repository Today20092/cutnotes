import { useEffect, useState, type RefObject } from "react";

type Storyboard = {
  url: string; tile_width: number; tile_height: number;
  tiles: { start: number; x: number; y: number }[];
};

export function Timeline({ videoRef, storyboardUrl, frameRate, onSeek }: {
  videoRef: RefObject<HTMLVideoElement | null>; storyboardUrl: string; frameRate: number | null;
  onSeek: () => void;
}) {
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [preview, setPreview] = useState<number | null>(null);
  const [storyboard, setStoryboard] = useState<Storyboard | null>(null);
  useEffect(() => {
    const video = videoRef.current!;
    const update = () => {
      setPosition(video.currentTime);
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
    };
    update();
    video.addEventListener("timeupdate", update);
    video.addEventListener("durationchange", update);
    return () => {
      video.removeEventListener("timeupdate", update);
      video.removeEventListener("durationchange", update);
    };
  }, [videoRef]);
  useEffect(() => {
    const abort = new AbortController();
    setStoryboard(null);
    void fetch(storyboardUrl, { signal: abort.signal }).then(async (response) => {
      if (!response.ok) return;
      const data = await response.json() as Storyboard;
      const image = new URL(data.url, storyboardUrl);
      const source = new URL(storyboardUrl);
      // Only fetch the same Mux storyboard image; never forward credentials to another host.
      if (image.origin !== source.origin || image.pathname !== source.pathname.replace(/\.json$/, ".jpg") ||
        !(data.tile_width > 0 && data.tile_width <= 4096 && data.tile_height > 0 && data.tile_height <= 4096) ||
        !Array.isArray(data.tiles) || !data.tiles.every((tile: Storyboard["tiles"][number]) =>
          Number.isFinite(tile.start) && tile.start >= 0 && Number.isFinite(tile.x) && tile.x >= 0 && Number.isFinite(tile.y) && tile.y >= 0)) return;
      image.search = source.search;
      if (!abort.signal.aborted) setStoryboard({ ...data, url: image.href });
    }).catch(() => {});
    return () => abort.abort();
  }, [storyboardUrl]);
  const tile = preview === null ? undefined : storyboard?.tiles.findLast((tile) => tile.start <= preview);
  const scale = storyboard ? Math.min(1, 240 / storyboard.tile_width, 135 / storyboard.tile_height) : 1;
  return <div className="relative pt-2">
    {tile && storyboard && <div role="img" aria-label={`Preview at ${preview!.toFixed(2)} seconds`}
      className="pointer-events-none absolute bottom-full left-0 max-w-full overflow-hidden border border-white bg-black"
      style={{ width: storyboard.tile_width * scale, height: storyboard.tile_height * scale }}>
      <div style={{ width: storyboard.tile_width, height: storyboard.tile_height, transform: `scale(${scale})`, transformOrigin: "top left",
        backgroundImage: `url("${storyboard.url}")`, backgroundPosition: `-${tile.x}px -${tile.y}px` }} />
    </div>}
    <input type="range" aria-label="Playback position" min={0} max={duration} step={1 / (frameRate || 30)}
      value={position} disabled={!duration} aria-valuetext={`${position.toFixed(2)} of ${duration.toFixed(2)} seconds`}
      className="min-h-11 w-full accent-white focus-visible:outline-2"
      onFocus={() => setPreview(position)} onBlur={() => setPreview(null)}
      onPointerMove={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        setPreview(Math.max(0, Math.min(duration, (event.clientX - bounds.left) / bounds.width * duration)));
      }} onPointerLeave={() => setPreview(null)}
      onChange={(event) => {
        const time = Number(event.currentTarget.value);
        onSeek();
        videoRef.current!.currentTime = time;
        setPosition(time); setPreview(time);
      }} />
  </div>;
}
