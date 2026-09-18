import { lazy, Suspense, useEffect, useState } from 'react';
import {
  Button,
  Content,
  Heading,
  Provider,
  SegmentedControl,
  SegmentedControlItem,
  InlineAlert,
  LinkButton,
  ProgressCircle,
  Text,
} from '@react-spectrum/s2';
import type { Scenario } from './catalogue';
import { ThemeStudio, useThemeStudio } from './theme-studio';
import { GithubIcon } from './github-icon';
import { documentation } from './docs-content';
import logo from '../assets/brand/hud-ini-lockup.svg';
import logoDark from '../assets/brand/hud-ini-lockup-dark.svg';
import * as layout from './layout';

const HomePage = lazy(() => import('./home-page').then((module) => ({ default: module.HomePage })));
const DocsPage = lazy(() => import('./docs-page').then((module) => ({ default: module.DocsPage })));
const VehicleLab = lazy(() =>
  import('./vehicle-lab').then((module) => ({ default: module.VehicleLab })),
);
const ComponentLibrary = lazy(() =>
  import('./component-library').then((module) => ({ default: module.ComponentLibrary })),
);

const pages = [
  ['home', 'Home'],
  ['lab', 'Vehicle lab'],
  ['components', 'Components'],
  ['docs', 'Docs'],
] as const;
function pageForHash(hash: string) {
  const segment = hash.slice(1).split('/')[0];
  return pages.find(([id]) => id === segment)?.[0] ?? 'home';
}

export function App() {
  const [hash, setHash] = useState(location.hash);
  const [theme, setTheme] = useState('dusk');
  const [scenarios, setScenarios] = useState<Scenario[]>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [visited, setVisited] = useState(() => new Set([pageForHash(location.hash)]));
  const page = pageForHash(hash);
  const [, slug, anchor] = hash.slice(1).split('/');
  const needsFixtures = page !== 'docs';
  const studio = useThemeStudio(theme);
  const themeRevision = theme + JSON.stringify(studio.store.draft);
  useEffect(() => {
    const update = () => {
      setHash(location.hash);
      setVisited((previous) => new Set([...previous, pageForHash(location.hash)]));
    };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  useEffect(() => {
    const title =
      page === 'docs'
        ? (documentation.find((topic) => topic.id === (slug || 'getting-started'))?.title ??
          'Page not found')
        : pages.find(([id]) => id === page)![1];
    document.title = `hud-ini · ${title}`;
  }, [page, slug]);
  useEffect(() => {
    if (!needsFixtures || scenarios) return;
    let disposed = false;
    setError('');
    void (async () => {
      const response = await fetch('./fixtures/manifest.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const manifest = (await response.json()) as { scenarios: Scenario[] };
      await document.fonts.load('600 12px Rajdhani');
      await document.fonts.ready;
      if (!disposed) setScenarios(manifest.scenarios);
    })().catch((e) => {
      if (!disposed) setError(String(e));
    });
    return () => {
      disposed = true;
    };
  }, [attempt, needsFixtures, scenarios]);

  return (
    <Provider
      colorScheme={theme === 'bright' || theme === 'day' ? 'light' : 'dark'}
      background="base"
      elementType="main"
      styles={layout.app}
    >
      <header className={layout.header}>
        <a className={layout.brand} href="#home" aria-label="hud-ini home">
          <img
            src={theme === 'bright' || theme === 'day' ? logo : logoDark}
            alt=""
            width="136"
            height="32"
          />
        </a>
        <nav className={layout.headerNav} aria-label="Main navigation">
          <SegmentedControl
            aria-label="Workspace"
            selectedKey={page}
            onSelectionChange={(key) => {
              location.hash = String(key);
            }}
          >
            {pages.map(([id, label]) => (
              <SegmentedControlItem id={id} key={id}>
                {label}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
        </nav>
        <div className={layout.grow} />
        <div className={layout.headerActions}>
          <LinkButton
            id="source-link"
            href="https://github.com/GitGudNow99/hud-ini"
            target="_blank"
            rel="noreferrer"
            variant="secondary"
            fillStyle="outline"
            aria-label="Source on GitHub"
          >
            <GithubIcon />
            <Text>GitHub</Text>
          </LinkButton>
          <ThemeStudio studio={studio} palette={theme} onPaletteChange={setTheme} />
        </div>
      </header>
      <Suspense
        fallback={
          <div className={layout.empty}>
            <ProgressCircle aria-label="Loading page" isIndeterminate />
          </div>
        }
      >
        {page === 'home' && (
          <HomePage
            theme={themeRevision}
            loadError={error}
            onRetry={() => setAttempt((n) => n + 1)}
          />
        )}
        {page === 'docs' && <DocsPage slug={slug || undefined} anchor={anchor} />}
        {error && needsFixtures && page !== 'home' && (
          <div className={layout.empty}>
            <InlineAlert variant="negative">
              <Heading styles={layout.headingFont}>Could not load fixtures</Heading>
              <Content>
                {error}
                <Button onPress={() => setAttempt((n) => n + 1)}>Retry</Button>
              </Content>
            </InlineAlert>
          </div>
        )}
        {!scenarios && !error && (page === 'lab' || page === 'components') && (
          <div className={layout.empty}>
            <ProgressCircle aria-label="Loading hud-ini" isIndeterminate />
          </div>
        )}
        {scenarios && (visited.has('lab') || page === 'lab') && (
          <VehicleLab scenarios={scenarios} active={page === 'lab'} theme={theme} />
        )}
        {scenarios && (visited.has('components') || page === 'components') && (
          <ComponentLibrary
            scenarios={scenarios}
            active={page === 'components'}
            selectedId={page === 'components' ? slug : undefined}
            theme={themeRevision}
          />
        )}
      </Suspense>
    </Provider>
  );
}
