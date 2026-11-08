// Source lifecycle and position recovery adapted from Lawn (MIT); see LICENSE.lawn.
import Hls from "hls.js";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { getReview } from "@/server/playback";
import type { Playback } from "@/server/mux/gateway";
import { bindPlaybackShortcuts, createShuttleController } from "./shuttle";
import { createVideoPlaybackHealthState, observeVideoPlayback } from "./videoPlaybackHealth";
import { Timeline } from "./timeline";

type SafariVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
  webkitDisplayingFullscreen?: boolean;
};

export function VideoPlayer({ videoId, revisionId, frameRate, playback, seek, timelineMarkers, renewPlayback }: {
  /** Fetches fresh credentials for a caller who is not a Member. */
  renewPlayback?: () => Promise<{ playback: Playback | null }>;
  videoId: string; revisionId: string; frameRate: number | null; playback: Playback;
  seek?: { timeMs: number }; timelineMarkers?: ReactNode;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const shuttleRef = useRef<ReturnType<typeof createShuttleController> | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [initialPlayback] = useState(playback);
  const [failure, setFailure] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [poster, setPoster] = useState(playback.posterUrl);
  const [storyboardUrl, setStoryboardUrl] = useState(playback.storyboardUrl);

  useEffect(() => {
    if (!seek || !videoRef.current) return;
    shuttleRef.current?.pause();
    videoRef.current.currentTime = seek.timeMs / 1000;
  }, [seek]);

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
    shuttleRef.current = shuttle;

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
        const result = renewPlayback ? await renewPlayback() : await getReview({ data: { videoId, revisionId } });
        if (disposed) return;
        if (!result.playback) return failed();
        current = result.playback;
        setPoster(current.posterUrl);
        setStoryboardUrl(current.storyboardUrl);
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
        case "fullscreen": fullscreen(); break;
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
      shuttleRef.current = null;
      video.removeEventListener("loadedmetadata", loaded);
      video.removeEventListener("error", nativeError);
      video.removeEventListener("playing", progressed);
      video.removeAttribute("src"); video.load();
    };
  }, [videoId, revisionId, initialPlayback, frameRate, attempt]);

  function fullscreen() {
    const root = rootRef.current!;
    const video = videoRef.current as SafariVideo;
    const native = () => {
      // iPhone's native player may require a fresh tap instead of an orientation event.
      try {
        if (video.webkitDisplayingFullscreen) video.webkitExitFullscreen?.();
        else video.webkitEnterFullscreen?.();
      } catch { /* The explicit Full screen button remains available. */ }
    };
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else if (root.requestFullscreen) void root.requestFullscreen().catch(native);
    else native();
  }

  useEffect(() => {
    const landscape = matchMedia("(orientation: landscape) and (pointer: coarse)");
    const video = videoRef.current as SafariVideo;
    const rotate = () => {
      if (landscape.matches) {
        if (!document.fullscreenElement && !video.webkitDisplayingFullscreen) fullscreen();
      }
      else if (document.fullscreenElement === rootRef.current) void document.exitFullscreen().catch(() => {});
      else if (!landscape.matches && video.webkitDisplayingFullscreen) video.webkitExitFullscreen?.();
    };
    const changed = () => setIsFullscreen(document.fullscreenElement === rootRef.current);
    const nativeEntered = () => setIsFullscreen(true);
    const nativeExited = () => setIsFullscreen(false);
    landscape.addEventListener("change", rotate);
    document.addEventListener("fullscreenchange", changed);
    video.addEventListener("webkitbeginfullscreen", nativeEntered);
    video.addEventListener("webkitendfullscreen", nativeExited);
    rotate();
    return () => {
      landscape.removeEventListener("change", rotate);
      document.removeEventListener("fullscreenchange", changed);
      video.removeEventListener("webkitbeginfullscreen", nativeEntered);
      video.removeEventListener("webkitendfullscreen", nativeExited);
    };
  }, []);

  function step(frames: number) {
    shuttleRef.current?.step(frames, frameRate || 30);
  }

  return (
    <div ref={rootRef} role="region" aria-label="Video player" className="rounded-lg bg-black p-2 text-white" style={{ colorScheme: "dark" }}>
      <video ref={videoRef} controls controlsList="nodownload" crossOrigin="anonymous" playsInline
        aria-label="Revision playback" poster={poster} className="max-h-[50dvh] w-full bg-black"
        style={{ maxHeight: isFullscreen ? `calc(100dvh - ${timelineMarkers ? 11 : 8}rem)` : undefined }} />
      <Timeline videoRef={videoRef} storyboardUrl={storyboardUrl} frameRate={frameRate} onSeek={() => shuttleRef.current?.pause()} />
      {timelineMarkers}
      <div className="flex flex-wrap gap-2 pt-2">
        <button className="min-h-11 rounded border border-white px-3 focus-visible:outline-2" onClick={() => step(-1)}>Previous frame</button>
        <button className="min-h-11 rounded border border-white px-3 focus-visible:outline-2" onClick={() => step(1)}>Next frame</button>
        <button className="min-h-11 rounded border border-white px-3 focus-visible:outline-2" aria-pressed={isFullscreen} onClick={fullscreen}>Full screen</button>
      </div>
      {failure && <div role="alert" className="p-2">
        <p>{failure}</p>
        <Button onClick={() => { setFailure(""); setAttempt((value) => value + 1); videoRef.current?.focus(); }}>Retry playback</Button>
      </div>}
    </div>
  );
}
