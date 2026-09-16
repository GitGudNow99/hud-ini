import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActionButton,
  Button,
  ColorArea,
  ColorSlider,
  ColorSwatch,
  Content,
  Dialog,
  DialogTrigger,
  Heading,
  Popover,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  Text,
  TextField,
  parseColor,
} from '@react-spectrum/s2';
import Download from '@react-spectrum/s2/icons/Download';
import ColorIcon from '@react-spectrum/s2/icons/Color';
import Refresh from '@react-spectrum/s2/icons/Refresh';
import SaveFloppy from '@react-spectrum/s2/icons/SaveFloppy';
import Upload from '@react-spectrum/s2/icons/Upload';
import { defaultTheme, hudThemeFromCss, hudThemeVariables } from '../src/index.js';
import type { HudTheme } from '../src/index.js';
import { Choice, CopyButton } from './controls';
import * as layout from './layout';

const storageKey = 'hud-ini.themes.v1';
const colorTokens = [
  ['ink', 'Text'],
  ['accent', 'Accent'],
  ['muted', 'Secondary'],
  ['warning', 'Warning'],
  ['danger', 'Emergency'],
  ['panel', 'Readout fill'],
  ['outline', 'Contrast outline'],
] as const;
interface SavedTheme {
  id: string;
  name: string;
  theme: Partial<HudTheme>;
}
interface ThemeStore {
  version: 1;
  draft: Partial<HudTheme>;
  saved: SavedTheme[];
}
const builtins: Record<string, Partial<HudTheme>> = {
  phosphor: { ...defaultTheme, ink: '#d4ffdc', accent: '#5aff8b', muted: '#93b99c' },
  amber: { ...defaultTheme, ink: '#ffdda1', accent: '#ffb347', muted: '#c0a377', panel: '#1c1306' },
  ice: { ...defaultTheme, ink: '#f5faff', accent: '#92c5ff', muted: '#a9b9ce', panel: '#0a1421' },
};
function validateTheme(input: unknown): Partial<HudTheme> {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Expected a theme object.');
  const result: Partial<HudTheme> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!Object.hasOwn(hudThemeVariables, key)) continue;
    if (
      typeof value !== 'string' ||
      value.length > 240 ||
      !CSS.supports(key === 'fontFamily' ? 'font-family' : 'color', value)
    )
      throw new Error(`Invalid ${key} value.`);
    result[key as keyof HudTheme] = value;
  }
  return result;
}
function readStore(): ThemeStore {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as ThemeStore | null;
    if (raw?.version === 1 && Array.isArray(raw.saved))
      return {
        version: 1,
        draft: validateTheme(raw.draft),
        saved: raw.saved.slice(0, 50).map((item) => {
          if (typeof item.id !== 'string' || typeof item.name !== 'string')
            throw new Error('Invalid saved theme.');
          return { id: item.id, name: item.name.slice(0, 48), theme: validateTheme(item.theme) };
        }),
      };
  } catch {
    /* Storage can be unavailable or contain an older theme format. */
  }
  return { version: 1, draft: {}, saved: [] };
}
export function useThemeStudio(palette: string) {
  const [store, setStore] = useState(readStore);
  const [effective, setEffective] = useState<HudTheme>({ ...defaultTheme });
  const [storageError, setStorageError] = useState('');
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = palette;

    for (const variable of Object.values(hudThemeVariables)) root.style.removeProperty(variable);
    const base = { ...defaultTheme, ...hudThemeFromCss(root) };
    for (const [key, value] of Object.entries(store.draft))
      root.style.setProperty(hudThemeVariables[key as keyof HudTheme], value!);
    setEffective({ ...base, ...store.draft });
  }, [palette, store.draft]);
  const update = (next: ThemeStore) => {
    setStore(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setStorageError('');
    } catch {
      setStorageError('Theme applied. Browser storage is unavailable; export it to keep a copy.');
    }
  };
  return { store, effective, storageError, update };
}
function stylesheet(theme: HudTheme) {
  return `.hud-ini-theme {\n${Object.entries(hudThemeVariables)
    .map(([key, variable]) => `  ${variable}: ${theme[key as keyof HudTheme]};`)
    .join('\n')}\n}\n`;
}
function download(text: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function ThemeColorField({
  token,
  label,
  value,
  onChange,
}: {
  token: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const valid = CSS.supports('color', draft);
  const ctx = document.createElement('canvas').getContext('2d')!;
  ctx.fillStyle = value;
  let color;
  try {
    color = parseColor(ctx.fillStyle).toFormat('hsb');
  } catch {
    color = parseColor('#000000').toFormat('hsb');
  }
  return (
    <div className={layout.colorRow}>
      <TextField
        id={`theme-${token}`}
        label={label}
        prefix={<ColorSwatch color={color} size="XS" />}
        value={draft}
        isInvalid={!valid}
        errorMessage="Enter a CSS color."
        styles={layout.grow}
        onChange={(next) => {
          setDraft(next);
          if (CSS.supports('color', next)) onChange(next);
        }}
      />
      <DialogTrigger>
        <ActionButton aria-label={`${label} color picker`}>
          <ColorIcon />
        </ActionButton>
        <Popover aria-label={`${label} color picker`}>
          <div className={layout.stack}>
            <ColorArea
              aria-label={label}
              value={color}
              colorSpace="hsb"
              xChannel="saturation"
              yChannel="brightness"
              onChange={(next) => onChange(next.toString('hexa'))}
            />
            <ColorSlider
              label="Hue"
              channel="hue"
              value={color}
              onChange={(next) => onChange(next.toString('hexa'))}
            />
            <ColorSlider
              label="Opacity"
              channel="alpha"
              value={color}
              onChange={(next) => onChange(next.toString('hexa'))}
            />
          </div>
        </Popover>
      </DialogTrigger>
    </div>
  );
}

export function ThemeStudio({
  studio,
  palette,
  onPaletteChange,
}: {
  studio: ReturnType<typeof useThemeStudio>;
  palette: string;
  onPaletteChange: (value: string) => void;
}) {
  const { store, effective, update, storageError } = studio;
  const [name, setName] = useState('My HUD');
  const [selected, setSelected] = useState(Object.keys(store.draft).length ? 'custom' : 'palette');
  const [message, setMessage] = useState('');
  const [editorVersion, setEditorVersion] = useState(0);
  const file = useRef<HTMLInputElement>(null);
  const setDraft = (draft: Partial<HudTheme>) => {
    update({ ...store, draft });
    setSelected('custom');
    setMessage('');
  };
  const apply = (id: string) => {
    if (id === 'custom') {
      setSelected(id);
      return;
    }
    const saved = store.saved.find((item) => item.id === id);
    setDraft(saved?.theme ?? builtins[id] ?? {});
    setSelected(id);
    setEditorVersion((n) => n + 1);
    if (saved) setName(saved.name);
  };
  const save = (theme = effective, title = name) => {
    if (!title.trim()) {
      setMessage('Enter a theme name.');
      return;
    }
    const previous = store.saved.find((item) => item.name === title.trim());
    const item = {
      id: previous?.id ?? crypto.randomUUID(),
      name: title.trim().slice(0, 48),
      theme,
    };
    update({
      version: 1,
      draft: theme,
      saved: [...store.saved.filter((s) => s.id !== item.id), item].slice(-50),
    });
    setSelected(item.id);
    setName(item.name);
    setMessage('Saved in this browser.');
  };
  const fontChoices: [string, string][] = [
    [defaultTheme.fontFamily, 'Purista / Rajdhani'],
    ['adobe-clean-spectrum, sans-serif', 'Adobe Clean Spectrum'],
    ['ui-monospace, monospace', 'Monospace'],
  ];
  const normalizeFont = (font: string) => font.replace(/["'\s]/g, '').toLowerCase();
  const fontChoice = fontChoices.find(
    ([font]) =>
      normalizeFont(font) === normalizeFont(effective.fontFamily) ||
      (font === defaultTheme.fontFamily &&
        /^purista,rajdhani,/.test(normalizeFont(effective.fontFamily))),
  );
  const selectedFont = fontChoice?.[0] ?? effective.fontFamily;
  const json = JSON.stringify(
    { version: 1, name: name.trim() || 'My HUD', theme: effective },
    null,
    2,
  );
  const css = stylesheet(effective);
  const integration = `import { hudThemeFromCss } from 'hud-ini';\nimport { HudIni } from 'hud-ini/react';\n\n// Run after your container mounts, and again when its CSS theme changes.\nconst theme = hudThemeFromCss(container);\n\n<HudIni frame={telemetry} options={{ theme }} />`;
  return (
    <DialogTrigger>
      <ActionButton id="theme-open" aria-label="Theme settings">
        <ColorIcon />
        <Text>Theme</Text>
      </ActionButton>
      <Popover
        id="theme-editor"
        aria-label="Theme settings"
        placement="bottom end"
        hideArrow
        styles={layout.themePopover}
      >
        <div className={layout.stack}>
          <h2 className={layout.sectionHeading}>Theme</h2>
          <p className={layout.quiet}>Display palette and custom HUD styling.</p>
          <Choice
            id="theme"
            label="Display palette"
            value={palette}
            onChange={onPaletteChange}
            options={[
              ['bright', 'Bright'],
              ['day', 'Day'],
              ['dusk', 'Dusk'],
              ['night', 'Night'],
            ]}
          />
          <Choice
            id="theme-preset"
            label="Theme preset"
            value={selected}
            onChange={apply}
            options={[
              ['palette', 'Follow display palette'],
              ['custom', 'Custom'],
              ['phosphor', 'Phosphor'],
              ['amber', 'Amber'],
              ['ice', 'Ice'],
              ...store.saved.map((s) => [s.id, s.name] as const),
            ]}
          />
          <div className={layout.themeGrid}>
            {colorTokens.map(([token, label]) => (
              <ThemeColorField
                key={`${token}-${editorVersion}`}
                token={token}
                label={label}
                value={effective[token] ?? ''}
                onChange={(value) => setDraft({ ...store.draft, [token]: value })}
              />
            ))}
          </div>
          <Choice
            id="theme-font"
            label="Instrument font"
            value={selectedFont}
            onChange={(value) => setDraft({ ...store.draft, fontFamily: value })}
            options={[
              ...fontChoices,
              ...(fontChoice
                ? []
                : ([[effective.fontFamily, 'Imported font']] as [string, string][])),
            ]}
          />
          <TextField
            id="theme-name"
            label="Theme name"
            value={name}
            maxLength={48}
            onChange={setName}
            styles={layout.fullWidth}
          />
          <div className={layout.actions}>
            <Button variant="primary" onPress={() => save()}>
              <SaveFloppy />
              <Text>Save theme</Text>
            </Button>
            <ActionButton onPress={() => apply('palette')}>
              <Refresh />
              <Text>Reset</Text>
            </ActionButton>
          </div>
          <DialogTrigger>
            <ActionButton>
              <Download />
              <Text>Export / import theme</Text>
            </ActionButton>
            <Dialog isDismissible size="L">
              <Heading slot="title" styles={layout.headingFont}>
                Use your theme in another project
              </Heading>
              <Content>
                <div className={layout.stack}>
                  <p className={layout.quiet}>
                    Export CSS variables for a host stylesheet, or a JSON theme for
                    HudOptions.theme. Fonts must be supplied by your application.
                  </p>
                  <Tabs defaultSelectedKey="css" aria-label="Theme export format">
                    <TabList>
                      <Tab id="css">Stylesheet</Tab>
                      <Tab id="json">JSON</Tab>
                      <Tab id="usage">Integration</Tab>
                    </TabList>
                    <TabPanel id="css">
                      <div className={layout.stack}>
                        <pre id="theme-css" className={layout.code}>
                          {css}
                        </pre>
                        <div className={layout.actions}>
                          <CopyButton text={css} label="Copy CSS" />
                          <ActionButton
                            onPress={() => download(css, 'hud-ini-theme.css', 'text/css')}
                          >
                            <Download />
                            <Text>Download CSS</Text>
                          </ActionButton>
                        </div>
                      </div>
                    </TabPanel>
                    <TabPanel id="json">
                      <div className={layout.stack}>
                        <pre id="theme-json" className={layout.code}>
                          {json}
                        </pre>
                        <div className={layout.actions}>
                          <CopyButton text={json} label="Copy JSON" />
                          <ActionButton
                            onPress={() => download(json, 'hud-ini-theme.json', 'application/json')}
                          >
                            <Download />
                            <Text>Download JSON</Text>
                          </ActionButton>
                        </div>
                      </div>
                    </TabPanel>
                    <TabPanel id="usage">
                      <div className={layout.stack}>
                        <pre className={layout.code}>{integration}</pre>
                        <p className={layout.quiet}>
                          Give the host container the hud-ini-theme class. Read its inherited
                          variables after stylesheet changes, then pass the returned theme to the
                          renderer.
                        </p>
                      </div>
                    </TabPanel>
                  </Tabs>
                  <ActionButton onPress={() => file.current?.click()}>
                    <Upload />
                    <Text>Import theme JSON</Text>
                  </ActionButton>
                  <input
                    type="file"
                    ref={file}
                    accept=".json,application/json"
                    hidden
                    onChange={(e) => {
                      const input = e.target,
                        selected = input.files?.[0];
                      if (!selected) return;
                      if (selected.size > 20000) {
                        setMessage('Theme files must be smaller than 20 KB.');
                        input.value = '';
                        return;
                      }
                      void selected
                        .text()
                        .then((text) => {
                          const document = JSON.parse(text) as { name?: unknown; theme?: unknown };
                          const theme = validateTheme(document.theme);
                          if (!Object.keys(theme).length)
                            throw new Error('No supported theme tokens found.');
                          save(
                            { ...effective, ...theme },
                            typeof document.name === 'string' ? document.name : 'Imported theme',
                          );
                          setEditorVersion((n) => n + 1);
                        })
                        .catch((error) => setMessage(`Import failed: ${String(error)}`))
                        .finally(() => {
                          input.value = '';
                        });
                    }}
                  />
                  <p role="status" className={layout.quiet}>
                    {storageError || message}
                  </p>
                </div>
              </Content>
            </Dialog>
          </DialogTrigger>
          <p role="status" className={layout.quiet}>
            {storageError ||
              message ||
              'Applies to the HUD and component previews. Saved locally in this browser.'}
          </p>
        </div>
      </Popover>
    </DialogTrigger>
  );
}
