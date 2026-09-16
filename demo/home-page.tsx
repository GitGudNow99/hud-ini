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
import { HudController, sampleIndexAt } from '../src/index.js';
import type { VehiclePresetId } from '../src/index.js';
import type { Scenario } from './catalogue';
import { loadFixture } from './fixtures';
import { hudTheme } from './theme';
import * as layout from './layout';

function HomePreview({
  scenario,
  theme,
  paused,
  showHud,
  onPaused,
}: {
  scenario: Scenario;
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
    void loadFixture(scenario.id)
      .then((fixture) => {
        if (disposed) return;
        hud = new HudController(canvas);
        paint = () => {
          if (disposed || !canvas.isConnected) return;
          const narrow = canvas.clientWidth < 600;
          const time = (6 + media.currentTime) % fixture.duration;
          const frame = { ...fixture.frames[sampleIndexAt(fixture.frames, time)]!, time };
          hud!.update(frame, {
            preset: scenario.preset,
            size: narrow ? 'medium' : 'small',
            theme: hudTheme(),
            // Stock footage has no calibrated pose or flight log.
            panels: {
              attitude: false,
              ar: false,
              bearingMarkers: false,
              targets: false,
              trends: false,
              position: false,
              actuators: !narrow,
              tapes: !narrow,
              status: !narrow,
            },
          });
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
  }, [scenario, attempt]);

  return (
    <div id="home-preview" ref={viewport} className={layout.homeViewport}>
      <video
        ref={video}
        className={layout.videoLayer}
        src="./media/coast.mp4"
        poster="./media/coast.jpg"
        muted
        loop
        playsInline
        preload="auto"
        aria-label="Recorded aerial coastline footage"
        onError={() => {
          setError('The video could not be loaded.');
          onPaused(true);
        }}
      />
      <canvas
        ref={hudCanvas}
        className={layout.canvasLayer}
        role="img"
        aria-label="Illustrative HUD overlay"
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
  scenarios,
  theme,
  loadError,
  onRetry,
}: {
  scenarios?: readonly Scenario[];
  theme: string;
  loadError: string;
  onRetry: () => void;
}) {
  const [preset, setPreset] = useState<VehiclePresetId>('multirotor');
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
  const scenario = scenarios?.find((scenario) => scenario.preset === preset);
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
          {scenario ? (
            <HomePreview
              scenario={scenario}
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
                id="home-profile"
                aria-label="HUD profile"
                value={preset}
                styles={layout.picker}
                onChange={(key) => key && setPreset(key as VehiclePresetId)}
              >
                <PickerItem id="multirotor">Multirotor</PickerItem>
                <PickerItem id="plane">Fixed wing</PickerItem>
                <PickerItem id="boat">USV / boat</PickerItem>
              </Picker>
              <Checkbox isSelected={showHud} onChange={setShowHud}>
                HUD
              </Checkbox>
            </div>
            <Link isStandalone variant="secondary" href={`#lab/${preset}`}>
              Customize in vehicle lab
            </Link>
          </div>
          <div className={layout.homeDemoToolbar}>
            <Text styles={layout.quiet}>Recorded aerial footage · Illustrative telemetry</Text>
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
