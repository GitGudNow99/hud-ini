import { style } from '@react-spectrum/s2/style' with { type: 'macro' };

// Spectrum owns controls; shared heading typography follows the host-configurable HUD font.
const headingTypography = {
  fontFamily: '--hud-ini-font-family',
  fontWeight: '[600]',
} as const;
export const headingFont = style(headingTypography);
export const app = style({
  display: 'flex',
  flexDirection: 'column',
  minHeight: 'screen',
  height: { default: 'auto', xl: 'screen' },
  overflow: { default: 'visible', xl: 'hidden' },
  font: 'ui',
  color: 'neutral',
});
export const header = style({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 16,
  paddingX: { default: 16, md: 24 },
  paddingY: 12,
  backgroundColor: 'layer-1',
  flexShrink: 0,
});
export const brand = style({
  display: 'flex',
  flexShrink: 0,
  textDecoration: 'none',
});
export const headerNav = style({
  order: { default: 3, md: 0 },
  width: { default: 'full', md: 'auto' },
});
export const actions = style({ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 });
export const stack = style({ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 });
export const compactStack = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  minWidth: 0,
});
export const grow = style({ flexGrow: 1, minWidth: 0 });
export const fullWidth = style({ width: 'full', minWidth: 0 });
export const quiet = style({ font: 'body-sm', color: 'neutral-subdued', margin: 0 });
export const heading = style({ font: 'heading-lg', ...headingTypography, margin: 0 });
export const sectionHeading = style({ font: 'heading-xs', ...headingTypography, margin: 0 });
export const workspace = style({
  display: 'grid',
  gridTemplateColumns: {
    default: 'minmax(0, 1fr)',
    md: '200px minmax(0, 1fr)',
    xl: '200px minmax(0, 1fr) 288px',
  },
  flexGrow: 1,
  minHeight: 0,
  gap: 8,
  padding: 8,
});
export const fleet = style({
  display: { default: 'none', md: 'flex' },
  flexDirection: 'column',
  minHeight: 0,
  backgroundColor: 'layer-1',
  borderRadius: 'lg',
  padding: 12,
  gap: 16,
});
export const profiles = style({ height: 'full', flexGrow: 1 });
export const mobileProfiles = style({ display: { default: 'block', md: 'none' }, padding: 8 });
export const viewer = style({
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  minHeight: { default: 0, md: 720, xl: 0 },
  padding: { default: 8, md: 16 },
  gap: 16,
});
export const viewerToolbar = style({
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flexShrink: 0,
});
export const viewport = style({
  position: 'relative',
  flexGrow: 1,
  minHeight: { default: 420, md: 400 },
  aspectRatio: { default: '3/4', md: 'auto' },
  overflow: 'hidden',
  borderRadius: 'lg',
  backgroundColor: 'layer-2',
});
export const transport = style({ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 });
export const inspector = style({
  gridColumnStart: { default: 1, md: 2, xl: 3 },
  display: 'flex',
  flexDirection: 'column',
  gap: 24,
  minWidth: 0,
  padding: 20,
  overflowY: 'auto',
  backgroundColor: 'layer-1',
  borderRadius: 'lg',
});
export const settings = style({ display: 'flex', flexDirection: 'column', gap: 16 });
export const telemetry = style({
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 12,
  font: 'body-sm',
  margin: 0,
});
export const metricValue = style({ textAlign: 'end', margin: 0 });
export const code = style({
  fontFamily: 'code',
  fontSize: 'body-sm',
  lineHeight: 'body',
  padding: 16,
  backgroundColor: 'layer-2',
  borderRadius: 'lg',
  overflow: 'auto',
  maxWidth: 'full',
  maxHeight: '[52vh]',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  margin: 0,
});
export const library = style({
  flexGrow: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: { default: 16, md: 32 },
  display: 'flex',
  flexDirection: 'column',
  gap: 24,
});
export const libraryHeading = style({
  display: 'flex',
  alignItems: 'start',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: 16,
});
export const libraryToolbar = style({
  display: 'flex',
  alignItems: 'end',
  flexWrap: 'wrap',
  gap: 16,
});
export const search = style({ width: { default: 'full', md: 320 }, flexGrow: 1 });
export const filters = style({ overflowX: 'auto', flexShrink: 0 });
export const grid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))',
  gap: 20,
});
export const preview = style({
  height: 200,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  borderRadius: 'default',
});
export const cardContent = style({ alignContent: 'start' });
export const detail = style({
  width: 'full',
  maxWidth: 1100,
  marginX: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 24,
});
export const detailPreview = style<{ isStrip: boolean }>({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  height: { default: '[min(46vh, 440px)]', isStrip: 240 },
  minHeight: { default: 260, isStrip: 180 },
  borderRadius: 'lg',
  marginTop: 16,
});
export const detailToolbar = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: 12,
  marginY: 16,
});
export const empty = style({
  display: 'flex',
  alignItems: 'center',
  flexDirection: 'column',
  gap: 16,
  padding: 40,
});
export const themeGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 16,
});
export const themePopover = style({
  width: '[360px]',
  maxWidth: '[calc(100vw - 24px)]',
  maxHeight: '[calc(100dvh - 96px)]',
});
export const insetControl = style({ width: 'full', maxWidth: 360, marginTop: 24 });

export const picker = style({ width: 180, minWidth: 0 });

export const colorRow = style({ display: 'flex', alignItems: 'end', gap: 4, minWidth: 0 });

export const fitContent = style({ alignSelf: 'start' });
export const playbackRate = style({ width: 64, flexShrink: 0 });

export const pageScroll = style({ flexGrow: 1, minHeight: 0, overflowY: 'auto' });
export const homeLayout = style({
  maxWidth: 1320,
  marginX: 'auto',
  paddingX: { default: 20, md: 40 },
  paddingY: { default: 24, md: 32 },
  display: 'flex',
  flexDirection: 'column',
  gap: 32,
});
export const homeHero = style({
  display: 'grid',
  gridTemplateColumns: { default: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) auto' },
  alignItems: 'end',
  gap: 20,
});
export const heroCopy = style({ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 });
export const eyebrow = style({ font: 'detail', color: 'neutral-subdued' });
export const heroTitle = style({
  font: 'heading-2xl',
  ...headingTypography,
  fontSize: { default: '[28px]', lg: '[36px]' },
  lineHeight: 'heading',
  margin: 0,
});
export const pageTitle = style({ font: 'heading-xl', ...headingTypography, margin: 0 });
export const articleHeading = style({ font: 'heading-sm', ...headingTypography, margin: 0 });
export const lead = style({
  font: 'body-lg',
  color: 'neutral-subdued',
  margin: 0,
  maxWidth: '[52ch]',
});
export const prose = style({ font: 'body', margin: 0, color: 'neutral-subdued' });
export const homeDemo = style({ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 12 });
export const homeDemoToolbar = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: 8,
});
export const homeViewport = style({
  position: 'relative',
  aspectRatio: { default: '16/9', md: '21/9' },
  overflow: 'hidden',
  borderRadius: 'lg',
  backgroundColor: 'layer-1',
});
export const canvasLayer = style({ position: 'absolute', inset: 0, width: 'full', height: 'full' });
export const videoLayer = style({
  position: 'absolute',
  inset: 0,
  width: 'full',
  height: 'full',
  objectFit: 'cover',
});
export const previewStatus = style({
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
});
export const homeFeatures = style({
  display: 'grid',
  gridTemplateColumns: { default: 'minmax(0, 1fr)', md: 'repeat(3, minmax(0, 1fr))' },
  gap: 32,
});
export const homeGettingStarted = style({
  display: 'grid',
  gridTemplateColumns: { default: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' },
  gap: 32,
  alignItems: 'center',
  paddingY: 24,
});
export const docsLayout = style({
  display: 'grid',
  gridTemplateColumns: {
    default: 'minmax(0, 1fr)',
    md: '220px minmax(0, 1fr)',
    xl: '220px minmax(0, 1fr) 180px',
  },
  gap: { default: 32, md: 40 },
  padding: { default: 20, md: 32 },
  maxWidth: 1280,
  marginX: 'auto',
  alignItems: 'start',
});
export const docsSidebar = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
  position: { default: 'static', md: 'sticky' },
  top: 32,
  minWidth: 0,
});
export const docsDesktopNav = style({ display: { default: 'none', md: 'block' } });
export const docsMobileNav = style({ display: { default: 'block', md: 'none' } });
export const docsArticle = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 40,
  minWidth: 0,
  maxWidth: 'full',
  outlineStyle: 'none',
});
export const docsSection = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  minWidth: 0,
  scrollMarginTop: 32,
});
export const docsContents = style({
  display: { default: 'none', xl: 'flex' },
  flexDirection: 'column',
  gap: 16,
  position: 'sticky',
  top: 32,
});
export const codeExample = style({
  borderRadius: 'lg',
  backgroundColor: 'layer-1',
  overflow: 'hidden',
  minWidth: 0,
});
export const codeToolbar = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  paddingX: 16,
  paddingY: 8,
});
export const docCode = style({
  fontFamily: 'code',
  fontSize: 'body-sm',
  lineHeight: 'body',
  margin: 0,
  padding: 20,
  overflowX: 'auto',
  whiteSpace: 'pre',
  maxWidth: 'full',
});
export const articlePagination = style({
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 12,
  paddingBottom: 32,
});
