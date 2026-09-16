import { hudThemeFromCss } from '../src/index.js';

export function hudTheme() {
  return hudThemeFromCss(document.documentElement);
}
