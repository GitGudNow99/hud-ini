import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionButton,
  Badge,
  Button,
  Card,
  CardPreview,
  Content,
  Footer,
  Heading,
  InlineAlert,
  LinkButton,
  SearchField,
  Slider,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  Text,
  ToggleButton,
  ToggleButtonGroup,
} from '@react-spectrum/s2';
import ChevronLeft from '@react-spectrum/s2/icons/ChevronLeft';
import ChevronRight from '@react-spectrum/s2/icons/ChevronRight';
import Code from '@react-spectrum/s2/icons/Code';
import Pause from '@react-spectrum/s2/icons/Pause';
import Play from '@react-spectrum/s2/icons/Play';
import Refresh from '@react-spectrum/s2/icons/Refresh';
import * as layout from './layout';
import { Choice, CopyButton } from './controls';
import { createSpecimens } from './catalogue';
import type { Scenario, Specimen } from './catalogue';
import { PreviewData } from './preview-data';
import { PreviewClock } from './preview-clock';
import { PreviewCanvas } from './preview-canvas';
import { instrumentPanels } from './states';

function snippet(item: Specimen, insetWidth: number) {
  const panels = Object.fromEntries(
    instrumentPanels.map(([key]) => [key, item.panels.includes(key)]),
  );
  return `import { HudIni } from '@gitgudnow99/hud-ini/react';\n\n<HudIni\n  frame={telemetry}\n  options={{\n    preset: '${item.preset}',\n    panels: ${JSON.stringify(panels, null, 2).replaceAll('\n', '\n    ')}${item.id === 'inset' ? `,\n    inset: { image: cameraVideo, at: cameraTimestamp, label: 'CAMERA', width: ${insetWidth} }` : ''}\n  }}\n/>`;
}

export function ComponentLibrary({
  scenarios,
  selectedId,
  theme,
  active,
}: {
  scenarios: readonly Scenario[];
  selectedId?: string;
  theme: string;
  active: boolean;
}) {
  const items = useMemo(() => createSpecimens(scenarios), [scenarios]);
  const [data, setData] = useState<PreviewData>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All components');
  const [background, setBackground] = useState('dark');
  const [state, setState] = useState('current');
  const [paused, setPaused] = useState(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [clock] = useState(() => new PreviewClock());
  const scroll = useRef<HTMLElement>(null);
  const gridScroll = useRef(0);
  useEffect(() => {
    let disposed = false;
    const next = new PreviewData(scenarios);
    setError('');
    void next
      .load()
      .then(() => {
        if (!disposed) setData(next);
      })
      .catch((e) => {
        if (!disposed) setError(String(e));
      });
    return () => {
      disposed = true;
    };
  }, [scenarios, attempt]);
  useEffect(() => {
    const update = () => clock.setRunning(active && !paused && !document.hidden);
    update();
    document.addEventListener('visibilitychange', update);
    return () => {
      clock.setRunning(false);
      document.removeEventListener('visibilitychange', update);
    };
  }, [active, paused, clock]);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      if (media.matches) setPaused(true);
    };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = selectedId ? 0 : gridScroll.current;
  }, [selectedId]);
  const item = items.find((item) => item.id === selectedId);
  const visible = items.filter(
    (item) =>
      (category === 'All components' || item.category === category) &&
      `${item.title} ${item.description} ${item.category}`
        .toLowerCase()
        .includes(query.toLowerCase().trim()),
  );
  const settings = (
    <>
      <Choice
        compact
        id="component-background"
        label="Preview background"
        value={background}
        onChange={setBackground}
        options={[
          ['dark', 'Dark video'],
          ['white', 'White video'],
          ['checker', 'Transparency'],
        ]}
      />
      <Choice
        compact
        id="component-state"
        label="Data state"
        value={state}
        onChange={setState}
        options={[
          ['current', 'Current'],
          ['stale', 'Stale'],
          ['missing', 'Missing'],
        ]}
      />
      <ActionButton id="preview-motion" onPress={() => setPaused(!paused)} aria-pressed={paused}>
        {paused ? <Play /> : <Pause />}
        <Text>{paused ? 'Resume previews' : 'Pause previews'}</Text>
      </ActionButton>
    </>
  );
  return (
    <section
      ref={scroll}
      id="component-library"
      className={layout.library}
      hidden={!active}
      aria-label="Component kitchen sink"
      onScroll={(e) => {
        if (!selectedId) gridScroll.current = e.currentTarget.scrollTop;
      }}
    >
      {selectedId ? (
        <div className={layout.detail}>
          <div className={layout.detailToolbar}>
            <LinkButton variant="secondary" fillStyle="outline" href="#components">
              <ChevronLeft />
              <Text>All components</Text>
            </LinkButton>
            {item && (
              <div className={layout.actions}>
                {[-1, 1].map((offset) => {
                  const next = items[items.indexOf(item) + offset];
                  return (
                    next && (
                      <LinkButton
                        variant="secondary"
                        fillStyle="outline"
                        key={offset}
                        aria-label={`${offset < 0 ? 'Previous' : 'Next'} component: ${next.title}`}
                        href={`#components/${next.id}`}
                      >
                        {offset < 0 ? <ChevronLeft /> : <ChevronRight />}
                      </LinkButton>
                    )
                  );
                })}
              </div>
            )}
          </div>
          {!item ? (
            <div className={layout.empty}>
              <h1 className={layout.heading}>Component unavailable</h1>
              <p className={layout.quiet}>Choose a component from the catalogue.</p>
            </div>
          ) : (
            <>
              <header className={layout.libraryHeading}>
                <div className={layout.compactStack}>
                  <Badge variant="neutral" styles={layout.fitContent}>
                    {item.category}
                  </Badge>
                  <h1 className={layout.heading}>{item.title}</h1>
                  <p className={layout.quiet}>{item.description}</p>
                </div>
              </header>
              {data && (
                <ComponentDetail
                  key={item.id}
                  {...{ item, data, clock, state, theme, background, settings }}
                />
              )}
            </>
          )}
        </div>
      ) : (
        <>
          <header className={layout.libraryHeading}>
            <div className={layout.compactStack}>
              <h1 className={layout.heading}>Components</h1>
              <p className={layout.quiet}>
                Explore instruments, vehicles and operational states. Open a preview for
                configuration and sample data.
              </p>
            </div>
            <Badge id="component-count" variant="neutral">
              {visible.length} / {items.length} components
            </Badge>
          </header>
          <div className={layout.libraryToolbar}>
            <SearchField
              id="component-search"
              label="Search components"
              placeholder="Heading, rangefinder, USV…"
              value={query}
              onChange={setQuery}
              styles={layout.search}
            />
            <div className={layout.libraryToolbar}>{settings}</div>
          </div>
          <div className={layout.filters}>
            <ToggleButtonGroup
              id="component-filters"
              aria-label="Component categories"
              selectionMode="single"
              disallowEmptySelection
              selectedKeys={[category]}
              onSelectionChange={(keys) => {
                setCategory(String([...keys][0]));
              }}
              isQuiet
            >
              {['All components', ...new Set(items.map((item) => item.category))].map((name) => (
                <ToggleButton key={name} id={name}>
                  {name}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </div>
          <div id="component-grid" className={layout.grid}>
            {data &&
              visible.map((item) => (
                <Card
                  key={item.id}
                  href={`#components/${item.id}`}
                  data-component={item.id}
                  variant="secondary"
                  size="L"
                  styles={layout.fullWidth}
                >
                  <CardPreview>
                    <div className={layout.preview} data-background={background} aria-hidden="true">
                      <PreviewCanvas {...{ item, data, clock, state, theme }} />
                    </div>
                  </CardPreview>
                  <Content styles={layout.cardContent}>
                    <Text slot="title" styles={layout.headingFont}>
                      {item.title}
                    </Text>
                    <Text slot="description">{item.description}</Text>
                  </Content>
                  <Footer>
                    <Text styles={layout.quiet}>{item.category}</Text>
                  </Footer>
                </Card>
              ))}
          </div>
          {data && !visible.length && (
            <div className={layout.empty} id="component-empty">
              <h2 className={layout.sectionHeading}>No matching components</h2>
              <p className={layout.quiet}>Try another search or category.</p>
              <Button
                variant="secondary"
                onPress={() => {
                  setQuery('');
                  setCategory('All components');
                }}
              >
                Clear filters
              </Button>
            </div>
          )}
        </>
      )}
      {!data && !error && <p role="status">Loading preview fixtures…</p>}
      {error && (
        <InlineAlert variant="negative">
          <Heading styles={layout.headingFont}>Could not load previews</Heading>
          <Content>
            {error}
            <Button onPress={() => setAttempt((n) => n + 1)}>Retry</Button>
          </Content>
        </InlineAlert>
      )}
    </section>
  );
}

function ComponentDetail({
  item,
  data,
  clock,
  state,
  theme,
  background,
  settings,
}: {
  item: Specimen;
  data: PreviewData;
  clock: PreviewClock;
  state: string;
  theme: string;
  background: string;
  settings: React.ReactNode;
}) {
  const [tab, setTab] = useState('preview');
  const [insetWidth, setInsetWidth] = useState(240);
  const [snapshot, setSnapshot] = useState(() => data.frame(item, clock.elapsed, state));
  const capture = () => setSnapshot(data.frame(item, clock.elapsed, state));
  const code = snippet(item, insetWidth);
  const json = JSON.stringify(snapshot, null, 2);
  return (
    <div className={layout.stack} id="component-detail">
      <div className={layout.libraryToolbar}>{settings}</div>
      <Tabs
        selectedKey={tab}
        onSelectionChange={(value) => {
          setTab(String(value));
          if (value === 'data') capture();
        }}
        aria-label="Component details"
      >
        <TabList>
          <Tab id="preview">Preview</Tab>
          <Tab id="code">
            <Code />
            <Text>Code</Text>
          </Tab>
          <Tab id="data">Sample data</Tab>
        </TabList>
        <TabPanel id="preview">
          <div
            className={layout.detailPreview({
              isStrip: item.panels.includes('heading') || item.crop[2] / item.crop[3] > 4,
            })}
            id="component-detail-preview"
            data-background={background}
            data-shape={
              item.panels.includes('heading') || item.crop[2] / item.crop[3] > 4 ? 'strip' : 'area'
            }
          >
            <PreviewCanvas {...{ item, data, clock, state, theme, insetWidth }} scale={2.5} />
          </div>
          {item.id === 'inset' && (
            <Slider
              id="component-inset-width"
              label="Camera inset width"
              minValue={160}
              maxValue={400}
              step={20}
              value={insetWidth}
              onChange={setInsetWidth}
              styles={layout.insetControl}
            />
          )}
        </TabPanel>
        <TabPanel id="code">
          <div className={layout.detailToolbar}>
            <span>React configuration</span>
            <CopyButton key={code} id="component-copy" text={code} />
          </div>
          <pre className={layout.code}>
            <code id="component-detail-code">{code}</code>
          </pre>
          <p className={layout.quiet}>
            Supply a timestamped HudFrame from your application. This configuration isolates the
            selected instrument.
          </p>
        </TabPanel>
        <TabPanel id="data">
          <div className={layout.detailToolbar}>
            <span>Sample at {snapshot.time.toFixed(2)} s · snapshot</span>
            <div className={layout.actions}>
              <ActionButton onPress={capture}>
                <Refresh />
                <Text>Capture current sample</Text>
              </ActionButton>
              <CopyButton key={json} text={json} label="Copy JSON" />
            </div>
          </div>
          <pre className={layout.code}>
            <code id="component-detail-data">{json}</code>
          </pre>
        </TabPanel>
      </Tabs>
    </div>
  );
}
