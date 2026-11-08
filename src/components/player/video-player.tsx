// Source lifecycle and position recovery adapted from Lawn (MIT); see LICENSE.lawn.
import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { getReview } from "@/server/playback";
import type { Playback } from "@/server/mux/gateway";
import { bindPlaybackShortcuts, createShuttleController } from "./shuttle";
import { createVideoPlaybackHealthState, observeVideoPlayback } from "./videoPlaybackHealth";

export function VideoPlayer({ videoId, revisionId, frameRate, playback }: {
  videoId: string; revisionId: string; frameRate: number | null; playback: Playback;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [initialPlayback] = useState(playback);
  const [failure, setFailure] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [poster, setPoster] = useState(playback.posterUrl);

  useEffect(() => {
    const video = videoRef.current!;
    const root = rootRef.current!;
    let disposed = false;
    let refreshing = false;
    let renewed = false;
    let current = initialPlayback;
    let hls: Hls | undefined;
    let resume: { time: number; playing: boolean } | undefined;
    let health = createVideoPlaybackHealthState();
    const shuttle = createShuttleController(video, () => {});

    function failed() { if (!disposed) setFailure("Playback could not continue. Try again."); }
    function load() {
      if (hls) hls.loadSource(current.videoUrl);
      else { video.src = current.videoUrl; video.load(); }
    }
    async function renew() {
      if (refreshing || disposed) return;
      // One automatic renewal per successful playback window avoids a 403 loop.
      if (renewed) return failed();
      refreshing = true;
      renewed = true;
      resume = { time: video.currentTime, playing: !video.paused };
      hls?.stopLoad();
      try {
        const result = await getReview({ data: { videoId, revisionId } });
        if (disposed) return;
        if (!result.playback) return failed();
        current = result.playback;
        setPoster(current.posterUrl);
        load();
      } catch { failed(); }
      finally { refreshing = false; }
    }
    function loaded() {
      if (!resume) return;
      video.currentTime = resume.time;
      if (resume.playing) void video.play().catch(failed);
      resume = undefined;
    }
    async function nativeError() {
      if (hls || disposed) return;
      // Safari does not expose the HTTP status on MediaError.
      try {
        const response = await fetch(current.videoUrl);
        if (disposed) return;
        if (response.status === 403) void renew();
        else failed();
      } catch { failed(); }
    }
    if (Hls.isSupported()) {
      hls = new Hls();
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.response?.code === 403) void renew();
        else if (data.fatal) failed();
      });
    }
    video.addEventListener("loadedmetadata", loaded);
    video.addEventListener("error", nativeError);
    const progressed = () => { if (!refreshing && !resume) renewed = false; };
    video.addEventListener("playing", progressed);
    const unbind = bindPlaybackShortcuts(root, true, (action) => {
      switch (action) {
        case "toggle": shuttle.toggle(); break;
        case "pause": shuttle.pause(); break;
        case "reverse": shuttle.shuttle(-1); break;
        case "forward": shuttle.shuttle(1); break;
        case "reverseNormal": shuttle.playAt(-1); break;
        case "slowReverse": shuttle.playAt(-0.25); break;
        case "slowForward": shuttle.playAt(0.25); break;
        case "stepBack": shuttle.step(-1, frameRate ?? 30); break;
        case "stepForward": shuttle.step(1, frameRate ?? 30); break;
        case "stepBackTen": shuttle.step(-10, frameRate ?? 30); break;
        case "stepForwardTen": shuttle.step(10, frameRate ?? 30); break;
        case "mute": video.muted = !video.muted; break;
        case "fullscreen": void video.requestFullscreen?.().catch(failed); break;
      }
    });
    const timer = window.setInterval(() => {
      const observation = observeVideoPlayback(health, {
        nowMs: performance.now(), mediaTime: video.currentTime,
        presentedFrames: video.getVideoPlaybackQuality().totalVideoFrames,
        playing: !video.paused, seeking: video.seeking,
        buffering: video.readyState < 3, visible: !document.hidden,
      });
      health = observation.state;
      if (observation.issueDetected) failed();
    }, 1000);
    load();
    return () => {
      disposed = true;
      window.clearInterval(timer);
      unbind(); shuttle.dispose(); hls?.destroy();
      video.removeEventListener("loadedmetadata", loaded);
      video.removeEventListener("error", nativeError);
      video.removeEventListener("playing", progressed);
      video.removeAttribute("src"); video.load();
    };
  }, [videoId, revisionId, initialPlayback, frameRate, attempt]);

  function step(frames: number) {
    const video = videoRef.current!;
    video.pause();
    video.currentTime = Math.max(0, Math.min(Number.isFinite(video.duration) ? video.duration : Infinity,
      video.currentTime + frames / (frameRate ?? 30)));
  }

  return (
    <div ref={rootRef} role="region" aria-label="Video player" className="rounded-lg bg-black p-2 text-white" style={{ colorScheme: "dark" }}>
      <video ref={videoRef} controls controlsList="nodownload" crossOrigin="anonymous" playsInline
        aria-label="Revision playback" poster={poster} className="max-h-[50dvh] w-full bg-black" />
      <div className="flex flex-wrap gap-2 pt-2">
        <button className="min-h-11 rounded border border-white px-3 focus-visible:outline-2" onClick={() => step(-1)}>Previous frame</button>
        <button className="min-h-11 rounded border border-white px-3 focus-visible:outline-2" onClick={() => step(1)}>Next frame</button>
      </div>
      {failure && <div role="alert" className="p-2">
        <p>{failure}</p>
        <Button onClick={() => { setFailure(""); setAttempt((value) => value + 1); videoRef.current?.focus(); }}>Retry playback</Button>
      </div>}
    </div>
  );
}
