import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionButton,
  Content,
  Disclosure,
  DisclosurePanel,
  DisclosureTitle,
  Divider,
  Heading,
  InlineAlert,
  Picker,
  PickerItem,
  SideNav,
  SideNavItem,
  SideNavItemContent,
  SideNavItemLink,
  Slider,
  TextField,
} from '@react-spectrum/s2';
import FullScreen from '@react-spectrum/s2/icons/FullScreen';
import FullScreenExit from '@react-spectrum/s2/icons/FullScreenExit';
import Play from '@react-spectrum/s2/icons/Play';
import Pause from '@react-spectrum/s2/icons/Pause';
import Refresh from '@react-spectrum/s2/icons/Refresh';
import * as layout from './layout';
import { fromPtz } from '../src/adapters.js';
import { vehiclePresets, sampleIndexAt, readValue } from '../src/index.js';
import type { HudFrame, HudOptions, VehiclePresetId } from '../src/index.js';
import { HudIni } from '../src/react.js';
import { VehicleScene } from './scene';
import { profileIcons } from './profile-icons';
import { displayStates, instrumentPanels, sensorExample, stateFrame, testCamera } from './states';
import type { DisplayState } from './states';
import { hudTheme } from './theme';
import { loadFixture } from './fixtures';
import { loadRecording, recordings, replayFrame } from './replay';
import type { Fixture, Scenario } from './catalogue';
import { Check, Choice, CopyButton } from './controls';

const primary = new Set([
  'frame',
  'heading',
  'bearingMarkers',
  'ar',
  'attitude',
  'tapes',
  'targets',
  'trends',
  'reticle',
  'actuators',
  'messages',
  'guidance',
]);
const profileNames: Partial<Record<VehiclePresetId, string>> = {
  vtol: 'VTOL',
  submarine: 'Submarine',
  tracker: 'Tracker',
  blimp: 'Blimp',
  generic: 'Generic',
};

/** Marks a variant that plays a recorded flight rather than a generated scenario. */
const RECORDED = 'recorded:';

export function VehicleLab({
  scenarios,
  active,
  theme,
}: {
  scenarios: readonly Scenario[];
  active: boolean;
  theme: string;
}) {
  const [presetId, setPreset] = useState<VehiclePresetId>('boat');
  const preset = vehiclePresets.find((p) => p.id === presetId)!;
  // Recorded flights join the profile they were flown with, ahead of the synthetic scenarios.
  const entries = [
    ...recordings
      .filter(() => presetId === 'multirotor')
      .map((r) => ({
        id: `${RECORDED}${r.id}`,
        preset: 'multirotor' as const,
        label: r.label,
        mavType: 2,
      })),
    ...scenarios.filter((s) => s.preset === presetId),
  ];
  const [variant, setVariant] = useState(() => scenarios.find((s) => s.preset === 'boat')!.id);
  const [fixture, setFixture] = useState<Fixture>();
  const [loadStatus, setLoadStatus] = useState('Loading scenario…');
  const [label, setLabel] = useState('USV 01');
  const [displayState, setDisplayState] = useState<DisplayState>('nominal');
  const [size, setSize] = useState<HudOptions['size']>('medium');
  const [panels, setPanels] = useState<NonNullable<HudOptions['panels']>>({
    ar: false,
    inset: false,
    rangefinder: false,
    camera: false,
    gps: false,
    link: false,
    health: false,
  });
  const [insetWidth, setInsetWidth] = useState(240);
  const [visible, setVisible] = useState(true);
  const [white, setWhite] = useState(false);
  const [freeze, setFreeze] = useState(false);
  const [pan, setPan] = useState(30),
    [tilt, setTilt] = useState(-10),
    [zoom, setZoom] = useState(1.5);
  const [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState('1');
  const [time, setTime] = useState(6);
  const timeRef = useRef(6);
  const [frame, setFrame] = useState<HudFrame>();
  // Synthetic scenarios all run 30 seconds; a recorded flight runs as long as its coverage.
  const duration = fixture?.duration ?? 30;
  const [fov, setFov] = useState(58);
  const canvas = useRef<HTMLCanvasElement>(null),
    viewport = useRef<HTMLDivElement>(null);
  const scene = useRef<VehicleScene | undefined>(undefined);
  const [fullscreen, setFullscreen] = useState(false);
  const [insetImage] = useState(testCamera);
  const frozen = useRef<{ frame: HudFrame; at: number } | undefined>(undefined);
  const current = useRef({
    active,
    fixture,
    preset,
    label,
    theme,
    displayState,
    freeze,
    pan,
    tilt,
    zoom,
    playing,
    speed,
  });
  current.current = {
    active,
    fixture,
    preset,
    label,
    theme,
    displayState,
    freeze,
    pan,
    tilt,
    zoom,
    playing,
    speed,
  };
  useEffect(() => {
    const next = new VehicleScene(canvas.current!);
    scene.current = next;
    let raf = 0,
      last = 0,
      painted = 0,
      sceneKey = '';
    const animate = (now: number) => {
      const c = current.current;
      const elapsed = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      if (c.active && !document.hidden) {
        if (c.playing) {
          timeRef.current = Math.min(
            c.fixture?.duration ?? 30,
            timeRef.current + elapsed * +c.speed,
          );
          if (timeRef.current >= (c.fixture?.duration ?? 30)) setPlaying(false);
        }
        if (now - painted > 40 && (c.fixture || c.preset.id === 'ptz')) {
          painted = now;
          const time = timeRef.current;
          const source =
            c.preset.id === 'ptz'
              ? fromPtz(
                  {
                    at: time,
                    panDeg: c.pan,
                    tiltDeg: c.tilt,
                    zoomRatio: c.zoom,
                    headingDeg: c.pan + 90,
                  },
                  time,
                  c.label,
                  'demo',
                )
              : {
                  ...c.fixture!.frames[sampleIndexAt(c.fixture!.frames, time)]!,
                  time,
                  label: c.label,
                };
          const key = JSON.stringify([
            c.preset.id,
            source.headingDeg,
            source.rollDeg,
            source.pitchDeg,
            source.latitudeDeg,
            source.longitudeDeg,
            source.altitudeM,
            source.depthM,
            source.panDeg,
            source.tiltDeg,
            source.zoomRatio,
            c.theme,
          ]);
          if (key !== sceneKey) {
            next.update(source, c.theme === 'night');
            sceneKey = key;
          }
          let rendered = stateFrame(sensorExample(source), c.displayState, c.preset.id);
          rendered.ar = next.arScene(rendered.time);
          if (c.freeze) {
            frozen.current ??= { frame: structuredClone(rendered), at: now / 1000 };
            rendered = {
              ...frozen.current.frame,
              label: c.label,
              time: frozen.current.frame.time + now / 1000 - frozen.current.at,
            };
          } else frozen.current = undefined;
          setFrame(rendered);
          setTime(time);
          setFov(next.verticalFovDeg);
        }
      }
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(raf);
      next.destroy();
      scene.current = undefined;
    };
  }, []);
  useEffect(() => {
    scene.current?.configure(preset);
    frozen.current = undefined;
  }, [preset]);
  useEffect(() => {
    let disposed = false;
    setFixture(undefined);
    setFrame(undefined);
    if (presetId === 'ptz') {
      setLoadStatus('');
      return;
    }
    setLoadStatus('Loading scenario…');
    const pending = variant.startsWith(RECORDED)
      ? loadRecording(variant.slice(RECORDED.length)).then((flight): Fixture => ({
          duration: flight.duration,
          frames: flight.frames.map((_, i) => replayFrame(flight, i)),
        }))
      : loadFixture(variant);
    void pending
      .then((next) => {
        if (!disposed) {
          setFixture(next);
          setLoadStatus('');
        }
      })
      .catch((error) => {
        if (!disposed) setLoadStatus(`Preview unavailable: ${String(error)}`);
      });
    return () => {
      disposed = true;
    };
  }, [variant, presetId]);
  useEffect(() => {
    if (!active) setPlaying(false);
  }, [active]);
  useEffect(() => {
    frozen.current = undefined;
  }, [displayState]);
  useEffect(() => {
    const update = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  const selectPreset = (id: VehiclePresetId) => {
    setPreset(id);
    setPlaying(false);
    setFreeze(false);
    frozen.current = undefined;
    timeRef.current = 6;
    setTime(6);
    setLabel(id === 'boat' ? 'USV 01' : `${id.toUpperCase()} 01`);
    setVariant(scenarios.find((s) => s.preset === id)?.id ?? '');
  };
  useEffect(() => {
    const navigate = () => {
      const id = location.hash.split('/')[1];
      if (location.hash.startsWith('#lab/') && vehiclePresets.some((p) => p.id === id))
        selectPreset(id as VehiclePresetId);
    };
    navigate();
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, [scenarios]);
  const options = useMemo<HudOptions>(
    () => ({
      preset: presetId,
      size,
      verticalFovDeg: fov,
      panels,
      staleAfterS: 1.2,
      inset: {
        image: insetImage,
        at: frozen.current?.frame.time ?? frame?.time ?? 0,
        label: 'TEST CAMERA',
        width: insetWidth,
      },
      theme: hudTheme(),
    }),
    // Theme is an explicit render dependency because its tokens live on the document root.
    [presetId, size, fov, panels, insetImage, insetWidth, frame, theme],
  );
  const hiddenPanels = Object.entries(panels)
    .filter(([, enabled]) => !enabled)
    .map(([name]) => `${name}: false`);
  const snippet = `<HudIni\n  frame={telemetry}\n  options={{ preset: '${presetId}', size: '${size}', panels: { ${hiddenPanels.join(', ')} }${panels.inset ? `, inset: { image: cameraVideo, at: cameraTimestamp, label: 'CAMERA', width: ${insetWidth} }` : ''} }}\n/>`;
  const value = (reading: HudFrame['headingDeg'], unit: string) => {
    const v = frame && readValue(reading, frame.time, 1.2);
    return v === undefined ? '-' : `${v.toFixed(1)} ${unit}`;
  };
  const metrics = [
    ['Heading', value(frame?.headingDeg, '°')],
    ['Ground speed', value(frame?.groundSpeedMps, 'm/s')],
    [
      preset.secondary === 'course' ? 'Course' : presetId === 'submarine' ? 'Depth' : 'Altitude',
      value(
        preset.secondary === 'course'
          ? frame?.courseDeg
          : presetId === 'submarine'
            ? frame?.depthM
            : frame?.altitudeM,
        preset.secondary === 'course' ? '°' : 'm',
      ),
    ],
    ['Battery', value(frame?.batteryPct, '%')],
    [
      'Mode',
      frame && (frame.heartbeatAt === undefined || frame.time - frame.heartbeatAt <= 1.2)
        ? (frame.mode ?? '-')
        : '-',
    ],
  ];
  const switches = (isPrimary: boolean) =>
    instrumentPanels
      .filter(([key]) => primary.has(key) === isPrimary)
      .map(([key, title]) => (
        <Fragment key={key}>
          <Check
            id={`panel-${key}`}
            checked={panels[key] ?? true}
            onChange={(checked) => setPanels((p) => ({ ...p, [key]: checked }))}
          >
            {title}
          </Check>
          {key === 'inset' && panels.inset && (
            <div className={layout.compactStack}>
              <Slider
                id="inset-width"
                label="Camera inset width"
                minValue={160}
                maxValue={400}
                step={20}
                value={insetWidth}
                onChange={setInsetWidth}
                styles={layout.fullWidth}
              />
              <p className={layout.quiet}>Fits available space. Hidden on narrow views.</p>
            </div>
          )}
        </Fragment>
      ));
  return (
    <div className={layout.workspace} id="vehicle-lab" hidden={!active}>
      <aside className={layout.fleet}>
        <h2 className={layout.sectionHeading}>Vehicles</h2>
        <SideNav
          id="profiles"
          aria-label="Vehicle profiles"
          selectedRoute={`#lab/${presetId}`}
          styles={layout.profiles}
        >
          {vehiclePresets.map((p) => {
            const Icon = profileIcons[p.id];
            return (
              <SideNavItem
                key={p.id}
                id={p.id}
                href={`#lab/${p.id}`}
                textValue={p.label}
                data-preset={p.id}
              >
                <SideNavItemContent>
                  <Icon />
                  <SideNavItemLink>{profileNames[p.id] ?? p.label}</SideNavItemLink>
                </SideNavItemContent>
              </SideNavItem>
            );
          })}
        </SideNav>
      </aside>
      <div className={layout.mobileProfiles}>
        <Choice
          id="mobile-profile"
          label="Vehicle profile"
          value={presetId}
          onChange={(id) => {
            location.hash = `lab/${id}`;
          }}
          options={vehiclePresets.map((p) => [p.id, p.label])}
        />
      </div>
      <section className={layout.viewer} aria-label="Vehicle HUD preview">
        <div className={layout.viewerToolbar}>
          <div className={layout.compactStack}>
            <h1 id="view-title" className={layout.sectionHeading}>
              {preset.label}
            </h1>
            <span id="frame-kind" className={layout.quiet}>
              {preset.domain.toUpperCase()} / {preset.family.toUpperCase()} · Synthetic
            </span>
          </div>
          <div className={layout.grow} />
          <Check id="hud-visible" checked={visible} onChange={setVisible}>
            HUD
          </Check>
          <ActionButton
            id="fullscreen"
            aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen viewer'}
            onPress={() =>
              void (
                document.fullscreenElement
                  ? document.exitFullscreen()
                  : viewport.current!.requestFullscreen()
              ).catch((e) => setLoadStatus(String(e)))
            }
          >
            {fullscreen ? <FullScreenExit /> : <FullScreen />}
          </ActionButton>
        </div>
        <div id="viewport" className={layout.viewport} ref={viewport} data-white={white}>
          <canvas id="scene" ref={canvas} aria-label="Synthetic vehicle preview" hidden={white} />
          <div id="hud" hidden={!visible}>
            {frame && <HudIni frame={frame} options={options} />}
          </div>
          {loadStatus && (
            <div id="load-status" role="status">
              <InlineAlert>
                <Heading styles={layout.headingFont}>Scenario</Heading>
                <Content>{loadStatus}</Content>
              </InlineAlert>
            </div>
          )}
        </div>
        <div className={layout.transport}>
          <ActionButton
            id="play"
            aria-label={playing ? 'Pause scenario' : 'Play scenario'}
            onPress={() => {
              if (timeRef.current >= duration) timeRef.current = 0;
              setPlaying(!playing);
            }}
          >
            {playing ? <Pause /> : <Play />}
          </ActionButton>

          <Slider
            id="seek"
            labelPosition="side"
            formatOptions={{
              style: 'unit',
              unit: 'second',
              unitDisplay: 'narrow',
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            }}
            aria-label="Scenario time"
            minValue={0}
            maxValue={duration}
            step={0.1}
            value={time}
            onChange={(value) => {
              setPlaying(false);
              timeRef.current = value;
              setTime(value);
            }}
            styles={layout.grow}
          />
          <Picker
            id="speed"
            styles={layout.playbackRate}
            aria-label="Playback speed"
            value={speed}
            onChange={(key) => setSpeed(String(key))}
            size="S"
            isQuiet
          >
            <PickerItem id=".5">0.5×</PickerItem>
            <PickerItem id="1">1×</PickerItem>
            <PickerItem id="2">2×</PickerItem>
          </Picker>
          <ActionButton
            id="restart"
            isQuiet
            aria-label="Restart scenario"
            onPress={() => {
              timeRef.current = 0;
              setTime(0);
            }}
          >
            <Refresh />
          </ActionButton>
        </div>
      </section>
      <aside className={layout.inspector}>
        <section className={layout.settings}>
          <h2 className={layout.sectionHeading}>Configuration</h2>
          <Choice
            id="variant"
            label="Vehicle type"
            value={variant}
            onChange={setVariant}
            disabled={presetId === 'ptz'}
            options={entries.map((s) => [s.id, s.label.split(' / ').at(-1)!.replaceAll('_', ' ')])}
          />
          <TextField
            id="vehicle-label"
            label="Vehicle label"
            value={label}
            maxLength={28}
            onChange={setLabel}
            styles={layout.fullWidth}
          />
          <Choice
            id="display-state"
            label="Display state"
            value={displayState}
            onChange={(v) => setDisplayState(v as DisplayState)}
            options={displayStates}
          />
        </section>
        <Divider />
        <section className={layout.settings}>
          <h2 className={layout.sectionHeading}>Instruments</h2>
          <Choice
            id="hud-size"
            label="HUD size"
            value={size ?? 'medium'}
            onChange={(v) => setSize(v as HudOptions['size'])}
            options={[
              ['small', 'Small · 80%'],
              ['medium', 'Medium · 100%'],
              ['large', 'Large · 120%'],
            ]}
          />
          <div
            id="panel-switches"
            className={layout.compactStack}
            role="group"
            aria-label="Visible instruments"
          >
            {switches(true)}
            <Disclosure isQuiet>
              <DisclosureTitle styles={layout.headingFont}>Additional instruments</DisclosureTitle>
              <DisclosurePanel>
                <div className={layout.compactStack}>{switches(false)}</div>
              </DisclosurePanel>
            </Disclosure>
          </div>
        </section>
        <Divider />
        <section className={layout.settings}>
          <h2 className={layout.sectionHeading}>Input test</h2>
          <Check id="freeze" checked={freeze} onChange={setFreeze}>
            Freeze telemetry
          </Check>
          <Check id="white-video" checked={white} onChange={setWhite}>
            White video test
          </Check>
          <p className={layout.quiet}>Readings expire after 1.2 s.</p>
          {presetId === 'ptz' && (
            <div id="ptz-controls" className={layout.stack}>
              <Slider
                id="pan"
                label="Pan"
                value={pan}
                onChange={setPan}
                minValue={-180}
                maxValue={180}
                step={1}
                styles={layout.fullWidth}
              />
              <Slider
                id="tilt"
                label="Tilt"
                value={tilt}
                onChange={setTilt}
                minValue={-60}
                maxValue={60}
                step={1}
                styles={layout.fullWidth}
              />
              <Slider
                id="zoom"
                label="Zoom"
                value={zoom}
                onChange={setZoom}
                minValue={1}
                maxValue={8}
                step={0.1}
                styles={layout.fullWidth}
              />
            </div>
          )}
        </section>
        <Divider />
        <section className={layout.settings}>
          <h2 className={layout.sectionHeading}>Telemetry</h2>
          <dl className={layout.telemetry} id="telemetry">
            {metrics.map(([k, v]) => (
              <Fragment key={k}>
                <dt className={layout.quiet}>{k}</dt>
                <dd className={layout.metricValue}>{v}</dd>
              </Fragment>
            ))}
          </dl>
          <Disclosure isQuiet>
            <DisclosureTitle styles={layout.headingFont}>Raw telemetry</DisclosureTitle>
            <DisclosurePanel>
              <pre id="frame-data" className={layout.code}>
                {JSON.stringify(frame, null, 2)}
              </pre>
            </DisclosurePanel>
          </Disclosure>
        </section>
        <Divider />
        <section className={layout.settings}>
          <h2 className={layout.sectionHeading}>Component</h2>
          <pre className={layout.code}>
            <code id="snippet">{snippet}</code>
          </pre>
          <CopyButton id="copy" text={snippet} label="Copy React snippet" />
        </section>
      </aside>
    </div>
  );
}
