import type { HudTheme } from './types.js';

/** CSS variables shared by host stylesheets and the Canvas theme adapter. */
export const hudThemeVariables = {
  ink: '--hud-ini-ink',
  accent: '--hud-ini-accent',
  muted: '--hud-ini-muted',
  warning: '--hud-ini-warning',
  danger: '--hud-ini-danger',
  panel: '--hud-ini-panel',
  outline: '--hud-ini-outline',
  fontFamily: '--hud-ini-font-family',
} as const satisfies Record<keyof HudTheme, string>;

/** Read inherited CSS tokens when drawing. Call again after a host theme or stylesheet changes. */
export function hudThemeFromCss(element: Element): Partial<HudTheme> {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (!style) return {};
  const theme: Partial<HudTheme> = {};
  for (const key of Object.keys(hudThemeVariables) as (keyof HudTheme)[]) {
    const value = style.getPropertyValue(hudThemeVariables[key]).trim();
    if (value) theme[key] = value;
  }
  return theme;
}
