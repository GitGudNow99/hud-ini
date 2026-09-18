import { useEffect, useRef, useState } from 'react';
import {
  ActionButton,
  Button,
  Checkbox,
  Content,
  Divider,
  Heading,
  InlineAlert,
  Link,
  LinkButton,
  ProgressCircle,
  Text,
  Picker,
  PickerItem,
} from '@react-spectrum/s2';
import ChevronRight from '@react-spectrum/s2/icons/ChevronRight';
import Pause from '@react-spectrum/s2/icons/Pause';
import Play from '@react-spectrum/s2/icons/Play';
import { HudController } from '../src/index.js';
import type { VehiclePresetId } from '../src/index.js';
import { loadRecording, recordings, replayFrame, replayIndexAt } from './replay';
import type { Recording } from './replay';
import { hudTheme } from './theme';
import * as layout from './layout';

/**
 * Vertical field of view of the part of the recording the viewport actually shows.
 *
 * The hero crops the video with `object-fit: cover`, so a wide viewport hides the top and the
 * bottom of the frame. The recording's own field of view then describes pixels nobody can see,
 * which misplaces the horizon and every AR anchor. Measure the visible slice instead.
 */
function visibleVerticalFovDeg(
  canvas: HTMLCanvasElement,
  camera: { width: number; height: number; verticalFovDeg: number },
): number {
  const boxWidth = canvas.clientWidth;
  const boxHeight = canvas.clientHeight;
  if (!(boxWidth > 0 && boxHeight > 0)) return camera.verticalFovDeg;
  const focal = camera.height / 2 / Math.tan((camera.verticalFovDeg * Math.PI) / 360);
  const cover = Math.max(boxWidth / camera.width, boxHeight / camera.height);
  const visibleHeight = Math.min(camera.height, boxHeight / cover);
  return (2 * Math.atan(visibleHeight / 2 / focal) * 180) / Math.PI;
}

function HomePreview({
  recording,
  theme,
  paused,
  showHud,
  onPaused,
}: {
  recording: Recording;
  theme: string;
  paused: boolean;
  showHud: boolean;
  onPaused: (paused: boolean) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const hudCanvas = useRef<HTMLCanvasElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const repaint = useRef<() => void>(() => {});
  useEffect(() => {
    repaint.current();
  }, [theme]);

  useEffect(() => {
    const media = video.current!;
    let visible = true;
    let disposed = false;
    const update = () => {
      if (paused || !visible || document.hidden) media.pause();
      else
        void media.play().catch((error: unknown) => {
          if (!disposed && error instanceof DOMException && error.name === 'NotAllowedError')
            onPaused(true);
        });
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting;
      update();
    });
    observer.observe(viewport.current!);
    document.addEventListener('visibilitychange', update);
    media.addEventListener('canplay', update);
    update();
    return () => {
      disposed = true;
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
      media.removeEventListener('canplay', update);
      media.pause();
    };
  }, [paused, onPaused]);

  useEffect(() => {
    const media = video.current!;
    const canvas = hudCanvas.current!;
    let disposed = false;
    let hud: HudController | undefined;
    let raf = 0;
    let paint = () => {};
    const resize = new ResizeObserver(() => paint());
    resize.observe(canvas);
    const tick = () => {
      paint();
      if (!media.paused && !media.ended) raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      paint();
    };
    const start = () => {
      cancelAnimationFrame(raf);
      tick();
    };
    setLoading(true);
    setError('');
    void loadRecording(recording.id)
      .then((flight) => {
        if (disposed) return;
        hud = new HudController(canvas);
        paint = () => {
          if (disposed || !canvas.isConnected) return;
          // The recording and the telemetry share one clock, so read the media clock directly.
          const time = media.currentTime;
          const frame = replayFrame(flight, replayIndexAt(flight, time));
          hud!.update(
            { ...frame, time },
            {
              preset: flight.preset as VehiclePresetId,
              // One size at every width, so the layout scales instead of rearranging.
              size: 'small',
              theme: hudTheme(),
              // The camera is calibrated and the pose is measured, so the spatial cues hold.
              verticalFovDeg: visibleVerticalFovDeg(canvas, flight.camera),
              panels: { bearingMarkers: false, targets: false, ar: !!flight.scene },
            },
          );
        };
        repaint.current = paint;
        media.addEventListener('playing', start);
        media.addEventListener('pause', stop);
        media.addEventListener('waiting', stop);
        media.addEventListener('seeked', paint);
        media.addEventListener('loadeddata', paint);
        start();
        setLoading(false);
      })
      .catch(() => {
        if (!disposed) {
          setError('The example telemetry could not be loaded.');
          setLoading(false);
        }
      });
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      resize.disconnect();
      repaint.current = () => {};
      media.removeEventListener('playing', start);
      media.removeEventListener('pause', stop);
      media.removeEventListener('waiting', stop);
      media.removeEventListener('seeked', paint);
      media.removeEventListener('loadeddata', paint);
      hud?.destroy();
    };
  }, [recording, attempt]);

  return (
    <div id="home-preview" ref={viewport} className={layout.homeViewport}>
      <video
        ref={video}
        className={layout.videoLayer}
        src={`./replay/${recording.video}`}
        muted
        loop
        playsInline
        preload="auto"
        aria-label={`Recorded flight: ${recording.label}`}
        onError={() => {
          setError('The video could not be loaded.');
          onPaused(true);
        }}
      />
      <canvas
        ref={hudCanvas}
        className={layout.canvasLayer}
        role="img"
        aria-label="HUD overlay driven by the recorded telemetry"
        hidden={loading || !!error || !showHud}
      />
      {loading && !error && (
        <div className={layout.previewStatus}>
          <ProgressCircle aria-label="Loading preview" isIndeterminate />
        </div>
      )}
      {error && (
        <div className={layout.previewStatus}>
          <InlineAlert variant="negative">
            <Heading styles={layout.headingFont}>Preview unavailable</Heading>
            <Content>
              {error}
              <Button
                onPress={() => {
                  video.current?.load();
                  setAttempt((n) => n + 1);
                }}
              >
                Retry preview
              </Button>
            </Content>
          </InlineAlert>
        </div>
      )}
    </div>
  );
}

export function HomePage({
  theme,
  loadError,
  onRetry,
}: {
  theme: string;
  loadError: string;
  onRetry: () => void;
}) {
  const [recordingId, setRecordingId] = useState(recordings[0]!.id);
  const [showHud, setShowHud] = useState(true);
  const [paused, setPaused] = useState(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      if (media.matches) setPaused(true);
    };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const recording = recordings.find((item) => item.id === recordingId);
  return (
    <div id="home-page" className={layout.pageScroll}>
      <div className={layout.homeLayout}>
        <section className={layout.homeHero} aria-labelledby="home-title">
          <div className={layout.heroCopy}>
            <h1 id="home-title" className={layout.heroTitle}>
              HUD components for unmanned vehicles.
            </h1>
            <p className={layout.prose}>
              Instruments, vehicle controls and spatial overlays. Connect your video and telemetry.
            </p>
          </div>
          <div className={layout.actions}>
            <LinkButton href="#docs/getting-started" variant="primary">
              <Text>Get started</Text>
              <ChevronRight />
            </LinkButton>
            <LinkButton href="#components" variant="secondary" fillStyle="outline">
              Browse components
            </LinkButton>
          </div>
        </section>
        <section className={layout.homeDemo} aria-label="Video demonstration">
          {recording ? (
            <HomePreview
              recording={recording}
              theme={theme}
              paused={paused}
              showHud={showHud}
              onPaused={setPaused}
            />
          ) : (
            <div className={layout.homeViewport}>
              <div className={layout.previewStatus}>
                {loadError ? (
                  <InlineAlert variant="negative">
                    <Heading styles={layout.headingFont}>Preview unavailable</Heading>
                    <Content>
                      {loadError}
                      <Button onPress={onRetry}>Retry preview</Button>
                    </Content>
                  </InlineAlert>
                ) : (
                  <ProgressCircle aria-label="Loading preview" isIndeterminate />
                )}
              </div>
            </div>
          )}
          <div className={layout.homeDemoToolbar}>
            <div className={layout.actions}>
              <ActionButton
                aria-label={paused ? 'Play home preview' : 'Pause home preview'}
                onPress={() => setPaused(!paused)}
              >
                {paused ? <Play /> : <Pause />}
              </ActionButton>
              <Picker
                id="home-recording"
                aria-label="Recorded flight"
                value={recordingId}
                styles={layout.picker}
                onChange={(key) => key && setRecordingId(String(key))}
              >
                {recordings.map((item) => (
                  <PickerItem id={item.id} key={item.id}>
                    {item.label}
                  </PickerItem>
                ))}
              </Picker>
              <Checkbox isSelected={showHud} onChange={setShowHud}>
                HUD
              </Checkbox>
            </div>
            <Link isStandalone variant="secondary" href="#lab/multirotor">
              Customize in vehicle lab
            </Link>
          </div>
          <div className={layout.homeDemoToolbar}>
            <Text styles={layout.quiet}>
              {recording
                ? `${recording.credit} · ${recording.license}` +
                  (recording.derived.length
                    ? ` · ${recording.derived.join(', ')} resolved, not recorded`
                    : ' · every value measured')
                : ''}
            </Text>
            <Link isStandalone variant="secondary" href="#docs/rendering/recorded-video">
              Video source &amp; integration
            </Link>
          </div>
        </section>
        <Divider />
        <section className={layout.homeFeatures} aria-label="Package capabilities">
          {[
            [
              'Instruments',
              'Heading, speed, altitude, payloads and operational states. Preview each component with its configuration and sample data.',
              '#components',
              'Explore components',
            ],
            [
              'Vehicle profiles',
              'Multirotor, fixed wing, surface, ground, underwater and PTZ. Select a preset, then adjust its instruments and theme.',
              '#docs/vehicles',
              'Vehicle reference',
            ],
            [
              'Use in your application',
              'A Canvas 2D renderer with React and web component wrappers. Supply timestamped telemetry through a common frame interface.',
              '#docs/rendering',
              'Integration guide',
            ],
          ].map(([title, text, href, label]) => (
            <div className={layout.stack} key={title}>
              <h2 className={layout.articleHeading}>{title}</h2>
              <p className={layout.prose}>{text}</p>
              <Link isStandalone variant="secondary" href={href}>
                {label}
              </Link>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
