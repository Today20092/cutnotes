// Source lifecycle and position recovery adapted from Lawn (MIT); see LICENSE.lawn.
import Hls from "hls.js";
import {
  Maximize,
  Minimize,
  Pause,
  Play,
  StepBack,
  StepForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip";
import { getReview } from "@/server/playback";
import type { Playback } from "@/server/mux/gateway";
import { bindPlaybackShortcuts, createShuttleController } from "./shuttle";
import { createVideoPlaybackHealthState, observeVideoPlayback } from "./videoPlaybackHealth";
import { Timeline, useVideoClock } from "./timeline";
import { DrawingOverlay } from "./drawing-overlay";

type SafariVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
  webkitDisplayingFullscreen?: boolean;
};

const controlClass = "size-11 [&_svg]:size-5";

/** Named on hover and focus; rendered inside the player so it still shows in full screen. */
function ControlTip({
  label,
  root,
  children,
}: {
  label: string;
  root: RefObject<HTMLDivElement | null>;
  children: ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipPopup portalProps={{ container: root }}>{label}</TooltipPopup>
    </Tooltip>
  );
}

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds) % 60).padStart(2, "0")}`;

export function VideoPlayer({
  videoId,
  revisionId,
  frameRate,
  playback,
  seek,
  timelineMarkers,
  drawing,
  renewPlayback,
}: {
  /** Fetches fresh credentials for a caller who is not a Member. */
  renewPlayback?: () => Promise<{ playback: Playback | null }>;
  videoId: string;
  revisionId: string;
  frameRate: number | null;
  playback: Playback;
  seek?: { timeMs: number };
  timelineMarkers?: ReactNode;
  drawing?: Omit<Parameters<typeof DrawingOverlay>[0], "videoRef">;
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
  const [media, setMedia] = useState({ paused: true, muted: false, waiting: false });
  const { position, duration } = useVideoClock(videoRef);

  useEffect(() => {
    const video = videoRef.current!;
    const sync = () =>
      setMedia({
        paused: video.paused,
        muted: video.muted,
        waiting: !video.paused && video.readyState < 3,
      });
    const events = ["play", "pause", "volumechange", "waiting", "playing", "canplay"];
    events.forEach((name) => video.addEventListener(name, sync));
    sync();
    return () => events.forEach((name) => video.removeEventListener(name, sync));
  }, []);

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

    function failed() {
      if (!disposed) setFailure("Playback could not continue. Try again.");
    }
    function load() {
      if (hls) hls.loadSource(current.videoUrl);
      else {
        video.src = current.videoUrl;
        video.load();
      }
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
        const result = renewPlayback
          ? await renewPlayback()
          : await getReview({ data: { videoId, revisionId } });
        if (disposed) return;
        if (!result.playback) return failed();
        current = result.playback;
        setPoster(current.posterUrl);
        setStoryboardUrl(current.storyboardUrl);
        load();
      } catch {
        failed();
      } finally {
        refreshing = false;
      }
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
      } catch {
        failed();
      }
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
    const progressed = () => {
      if (!refreshing && !resume) renewed = false;
    };
    video.addEventListener("playing", progressed);
    const unbind = bindPlaybackShortcuts(root, true, (action) => {
      switch (action) {
        case "toggle":
          shuttle.toggle();
          break;
        case "pause":
          shuttle.pause();
          break;
        case "reverse":
          shuttle.shuttle(-1);
          break;
        case "forward":
          shuttle.shuttle(1);
          break;
        case "reverseNormal":
          shuttle.playAt(-1);
          break;
        case "slowReverse":
          shuttle.playAt(-0.25);
          break;
        case "slowForward":
          shuttle.playAt(0.25);
          break;
        case "stepBack":
          shuttle.step(-1, frameRate ?? 30);
          break;
        case "stepForward":
          shuttle.step(1, frameRate ?? 30);
          break;
        case "stepBackTen":
          shuttle.step(-10, frameRate ?? 30);
          break;
        case "stepForwardTen":
          shuttle.step(10, frameRate ?? 30);
          break;
        case "mute":
          video.muted = !video.muted;
          break;
        case "fullscreen":
          fullscreen();
          break;
      }
    });
    const timer = window.setInterval(() => {
      const observation = observeVideoPlayback(health, {
        nowMs: performance.now(),
        mediaTime: video.currentTime,
        presentedFrames: video.getVideoPlaybackQuality().totalVideoFrames,
        playing: !video.paused,
        seeking: video.seeking,
        buffering: video.readyState < 3,
        visible: !document.hidden,
      });
      health = observation.state;
      if (observation.issueDetected) failed();
    }, 1000);
    load();
    return () => {
      disposed = true;
      window.clearInterval(timer);
      unbind();
      shuttle.dispose();
      hls?.destroy();
      shuttleRef.current = null;
      video.removeEventListener("loadedmetadata", loaded);
      video.removeEventListener("error", nativeError);
      video.removeEventListener("playing", progressed);
      video.removeAttribute("src");
      video.load();
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- Callers pass a new renewPlayback function each render. Listing it would rebuild the player.
  }, [videoId, revisionId, initialPlayback, frameRate, attempt]);

  function fullscreen() {
    const root = rootRef.current!;
    const video = videoRef.current as SafariVideo;
    const native = () => {
      // iPhone's native player may require a fresh tap instead of an orientation event.
      try {
        if (video.webkitDisplayingFullscreen) video.webkitExitFullscreen?.();
        else video.webkitEnterFullscreen?.();
      } catch {
        /* The explicit Full screen button remains available. */
      }
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
      } else if (document.fullscreenElement === rootRef.current)
        void document.exitFullscreen().catch(() => {});
      else if (!landscape.matches && video.webkitDisplayingFullscreen)
        video.webkitExitFullscreen?.();
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
    <div
      ref={rootRef}
      role="region"
      aria-label="Video player"
      className="review-player-root group/player rounded-lg bg-black p-2 text-white [--ring:white]"
      style={{ colorScheme: "dark" }}
    >
      <div className="review-picture relative">
        <video
          ref={videoRef}
          tabIndex={-1}
          crossOrigin="anonymous"
          playsInline
          onClick={() => shuttleRef.current?.toggle()}
          aria-label="Revision playback"
          poster={poster}
          className="max-h-[50dvh] w-full bg-black -outline-offset-2 group-has-focus-visible/player:outline-2"
          style={{
            maxHeight: isFullscreen ? `calc(100dvh - ${timelineMarkers ? 8 : 6.5}rem)` : undefined,
          }}
        />
        {media.waiting && !media.paused && (
          <Spinner className="pointer-events-none absolute top-1/2 left-1/2 size-10 -translate-1/2" />
        )}
        {media.paused && position === 0 && !drawing?.active && (
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-1/2 flex size-16 -translate-1/2 items-center justify-center rounded-full bg-black/60"
          >
            <Play className="size-7 fill-white" />
          </span>
        )}
        {drawing && (
          <DrawingOverlay key={String(drawing.active)} {...drawing} videoRef={videoRef} />
        )}
      </div>
      <div className="review-controls">
        <Timeline
          videoRef={videoRef}
          storyboardUrl={storyboardUrl}
          frameRate={frameRate}
          onSeek={() => shuttleRef.current?.pause()}
          markers={timelineMarkers}
        />
        <div className="player-deck flex flex-wrap items-center gap-1">
          <ControlTip label="Previous frame" root={rootRef}>
            <Button
              variant="ghost"
              className={controlClass}
              aria-label="Previous frame"
              onClick={() => step(-1)}
            >
              <StepBack aria-hidden />
            </Button>
          </ControlTip>
          <ControlTip label={media.paused ? "Play" : "Pause"} root={rootRef}>
            <Button
              variant="ghost"
              className={controlClass}
              aria-label={media.paused ? "Play" : "Pause"}
              onClick={() => shuttleRef.current?.toggle()}
            >
              {media.paused ? (
                <Play aria-hidden className="fill-current" />
              ) : (
                <Pause aria-hidden className="fill-current" />
              )}
            </Button>
          </ControlTip>
          <ControlTip label="Next frame" root={rootRef}>
            <Button
              variant="ghost"
              className={controlClass}
              aria-label="Next frame"
              onClick={() => step(1)}
            >
              <StepForward aria-hidden />
            </Button>
          </ControlTip>
          <span className="ml-2 text-sm tabular-nums">
            {clock(position)} / {clock(duration)}
          </span>
          <span className="ml-auto" />
          <ControlTip label="Mute" root={rootRef}>
            <Toggle
              className={controlClass}
              aria-label="Mute"
              pressed={media.muted}
              onPressedChange={() => {
                videoRef.current!.muted = !videoRef.current!.muted;
              }}
            >
              {media.muted ? <VolumeX aria-hidden /> : <Volume2 aria-hidden />}
            </Toggle>
          </ControlTip>
          <ControlTip label="Full screen" root={rootRef}>
            <Toggle
              className={controlClass}
              aria-label="Full screen"
              pressed={isFullscreen}
              onPressedChange={fullscreen}
            >
              {isFullscreen ? <Minimize aria-hidden /> : <Maximize aria-hidden />}
            </Toggle>
          </ControlTip>
        </div>
        {failure && (
          <div role="alert" className="p-2">
            <p>{failure}</p>
            <Button
              onClick={() => {
                setFailure("");
                setAttempt((value) => value + 1);
                videoRef.current?.focus();
              }}
            >
              Retry playback
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
