import type {
  ActuatorOutput,
  HudFrame,
  HudOptions,
  HudTheme,
  HudViewport,
  Reading,
} from './types.js';
import { activeAlerts, readGuidance, readingStatus, readValue, wrapHeading } from './telemetry.js';
import { vehiclePresets, presetForMavType } from './presets.js';
import { arGeometry, projectArPoint, projectArSegment } from './ar.js';

export const defaultTheme: Readonly<HudTheme> = Object.freeze({
  ink: '#f1f8f7',
  accent: '#49ded8',
  warning: '#ffd08a',
  danger: '#ff6b70',
  muted: '#afcccb',
  panel: '#081819',
  outline: '#031012',
  fontFamily: 'Purista, Rajdhani, "Geist Variable", "Segoe UI", sans-serif',
});

/** Transparent edge instruments. This compositor owns all HUD geometry and typography. */
export function renderHud(
  ctx: CanvasRenderingContext2D,
  frame: HudFrame,
  viewport: HudViewport,
  options: HudOptions = {},
): void {
  const { width, height } = viewport;
  if (!(width > 0 && height > 0)) return;
  const theme = { ...defaultTheme, ...options.theme };
  const outline = theme.outline ?? '#031012';
  const preset =
    vehiclePresets.find((p) => p.id === options.preset) ?? presetForMavType(frame.vehicleType ?? 0);
  const sizeScale = options.size === 'small' ? 0.8 : options.size === 'large' ? 1.2 : 1;
  const scale = Math.max(0.9, Math.min(1.6, width / 1050)) * sizeScale;
  const w = width / scale,
    h = height / scale,
    narrow = w < 620;
  const margin = narrow ? 22 : 32,
    cx = w / 2,
    cy = h * 0.5;
  const maxAge = options.staleAfterS ?? 1;
  const value = (r: Reading | undefined) => readValue(r, frame.time, maxAge);
  const validAt = (at: number) => readingStatus({ at, value: 0 }, frame.time, maxAge) === 'valid';
  const visible = (name: keyof NonNullable<HudOptions['panels']>, fallback = true) =>
    options.panels?.[name] ?? fallback;
  const fmt = (v: number | undefined, digits = 1) => (v === undefined ? '-' : v.toFixed(digits));
  const angular = (v: number | undefined) =>
    v === undefined ? '-' : String(Math.round(wrapHeading(v)) % 360).padStart(3, '0');
  const camera = preset.secondary === 'pan',
    marine = preset.id === 'boat',
    airframe = preset.id === 'plane' || preset.id === 'vtol';
  const speedReading = camera
    ? frame.panDeg
    : preset.speed === 'air'
      ? frame.airSpeedMps
      : frame.groundSpeedMps;
  const secondaryReading = camera
    ? frame.tiltDeg
    : preset.secondary === 'depth'
      ? frame.depthM
      : preset.secondary === 'course'
        ? frame.courseDeg
        : frame.altitudeM;
  const readingPhase = (r: Reading | undefined) => readingStatus(r, frame.time, maxAge);
  const readingColor = (r: Reading | undefined) =>
    readingPhase(r) === 'valid'
      ? theme.accent
      : readingPhase(r) === 'missing'
        ? theme.muted
        : theme.warning;
  const phaseLabel = (r: Reading | undefined) =>
    ({ valid: '', missing: 'NO DATA', stale: 'STALE', invalid: 'INVALID', future: 'CLOCK' })[
      readingPhase(r)
    ];
  ctx.save();
  ctx.setTransform(viewport.pixelRatio ?? 1, 0, 0, viewport.pixelRatio ?? 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.scale(scale, scale);
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  let textScale = 1;

  function text(
    x: number,
    y: number,
    label: string,
    size = 12,
    color = theme.ink,
    align: CanvasTextAlign = 'left',
    limit?: number,
  ): void {
    ctx.font = `600 ${(size * 1.15) / textScale}px ${theme.fontFamily}`;
    if (limit !== undefined)
      while (ctx.measureText(label).width > limit && label.length > 1)
        label = `${label.slice(0, -2)}…`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = outline;
    ctx.lineWidth = 2 / textScale;
    ctx.strokeText(label, x, y);
    ctx.fillStyle = color;
    ctx.fillText(label, x, y);
  }
  function path(points: number[], color = theme.ink, thickness = 1, halo = 2): void {
    ctx.beginPath();
    ctx.moveTo(points[0]!, points[1]!);
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i]!, points[i + 1]!);
    ctx.strokeStyle = outline;
    ctx.lineWidth = thickness + halo;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = thickness;
    ctx.stroke();
  }
  function line(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color = theme.ink,
    thickness = 1,
  ): void {
    path([x1, y1, x2, y2], color, thickness);
  }
  function circle(x: number, y: number, r: number, color = theme.accent): void {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = outline;
    ctx.lineWidth = 3.2;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  function valueBox(x: number, y: number, label: string, bw = 62, color = theme.accent): void {
    ctx.fillStyle = theme.panel;
    ctx.fillRect(x - bw / 2, y - 14, bw, 28);
    path(
      [
        x - bw / 2,
        y - 14,
        x + bw / 2,
        y - 14,
        x + bw / 2,
        y + 14,
        x - bw / 2,
        y + 14,
        x - bw / 2,
        y - 14,
      ],
      color,
    );
    text(x, y, label, 18, color, 'center');
  }

  const corner = narrow ? 20 : 34;
  const hasActuators =
    visible('actuators') && ((frame.outputs?.length ?? 0) > 0 || !!frame.actuators);
  const hasInset = visible('inset') && !!options.inset && !narrow;
  const insetRight = w - margin - corner - 12;
  const insetBottom = h - 105;
  const requestedInsetWidth = options.inset?.width ?? 240;
  const insetWidth = Math.max(
    0,
    Math.min(
      (Number.isFinite(requestedInsetWidth) && requestedInsetWidth > 0
        ? requestedInsetWidth
        : 240) / scale,
      insetRight - (cx + (visible('controls') && frame.controls ? 200 : 12)),
      (insetBottom - cy - 60) * (4 / 3),
    ),
  );
  const insetBox =
    hasInset && insetWidth > 0
      ? {
          x: insetRight - insetWidth,
          y: insetBottom - insetWidth * 0.75,
          width: insetWidth,
          height: insetWidth * 0.75,
        }
      : undefined;
  const positionedOutputs = frame.outputs?.every(
    (o) =>
      o.indicator && o.indicator.position.every((v) => Number.isFinite(v) && v >= -1 && v <= 1),
  );
  const rotorLayout = (preset.id === 'multirotor' || preset.id === 'generic') && positionedOutputs;
  const schematicX = margin + corner + (rotorLayout ? (narrow ? 68 : 80) : narrow ? 112 : 120);
  const schematicScale = 0.78;
  const schematicLegendY = h - (narrow ? 77 : 70);
  const schematicTop = schematicLegendY - 16 - (rotorLayout ? 195 : 145) * schematicScale;
  const alerts = visible('messages') ? activeAlerts(frame) : [];
  const alert = alerts[0];
  const danger = theme.danger ?? '#ff6b70';
  const alertColor =
    alert?.severity === 'emergency' || alert?.severity === 'critical'
      ? danger
      : alert?.severity === 'info'
        ? theme.accent
        : theme.warning;
  const messageY = narrow ? 142 : 105;
  const noticeWidth = Math.min(350, w - margin * 2 - (narrow ? 140 : 160));
  const guidance = visible('guidance') ? readGuidance(frame, maxAge) : undefined;
  const guidanceY = messageY + (alert ? 57 : 0);
  const rangefinder =
    options.rangefinderId === undefined
      ? frame.rangefinders?.[0]
      : frame.rangefinders?.find((sensor) => sensor.id === options.rangefinderId);
  const hasRangefinder = !narrow && visible('rangefinder') && !!rangefinder;
  const hasCamera = !narrow && visible('camera') && !!frame.camera;
  const hasGps =
    w >= 850 && visible('gps') && !!(frame.gpsFix || frame.gpsSatellites || frame.gpsHdop);
  const hasLink =
    w >= 900 &&
    visible('link') &&
    !!(frame.rcSignalPct || frame.rcRssi || frame.radioRssi || frame.radioRemoteRssi);
  const hasHealth = !narrow && visible('health') && !!frame.sensorHealth?.items.length;
  const sensorRight = w - margin - corner - 13;
  const sensorWidth = Math.min(200, w * 0.22);
  const systemsY = h - margin - 20;
  const gpsX = Math.max(margin + corner + 12 + (visible('position') ? 142 : 0), cx - 250);
  const linkX = cx + 125;
  const healthX = margin + corner + 13;
  const healthY = margin + 28;
  const tapeCueBoxes: { x: number; y: number; width: number; height: number }[] = [];
  const trendSeconds = Number.isFinite(options.trendSeconds)
    ? Math.max(1, Math.min(10, options.trendSeconds!))
    : 6;
  const ar = frame.ar;
  if (visible('ar') && ar && validAt(ar.camera.at) && ar.camera.position.every(Number.isFinite)) {
    const left = 8,
      right = w - 8;
    const top = 8,
      bottom = h - 8;
    const excluded = [
      ...(hasActuators
        ? [
            {
              x: left,
              y: schematicTop - 12,
              width: schematicX + 110 - left,
              height: h - schematicTop,
            },
          ]
        : []),
      ...(insetBox ? [insetBox] : []),
      ...(hasCamera || hasRangefinder
        ? [{ x: sensorRight - sensorWidth - 12, y: top, width: sensorWidth + 24, height: 100 }]
        : []),
      ...(alert || guidance
        ? [
            {
              x: cx - noticeWidth / 2,
              y: messageY - 18,
              width: noticeWidth,
              height: (alert ? 57 : 0) + (guidance ? 54 : 0),
            },
          ]
        : []),
    ];
    const labels: { x: number; y: number; width: number; height: number }[] = [
      ...excluded,
      ...(visible('identity') || visible('heading')
        ? [{ x: 0, y: 0, width: w, height: narrow ? 115 : 80 }]
        : []),
      ...(visible('status') || visible('position') || visible('power')
        ? [{ x: 0, y: h - 85, width: w, height: 85 }]
        : []),
      ...(visible('tapes')
        ? [
            { x: 0, y: 100, width: w * 0.13, height: h - 185 },
            { x: w * 0.87, y: 100, width: w * 0.13, height: h - 185 },
          ]
        : []),
      ...(visible('reticle') ? [{ x: cx - 34, y: cy - 24, width: 68, height: 48 }] : []),
    ];
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    const objects = ar.objects
      .filter((o) => o.visible !== false && validAt(o.at))
      .slice(0, 128)
      .sort((a, b) => Number(!!b.selected) - Number(!!a.selected));
    for (const object of objects) {
      const marker = ['waypoint', 'home', 'poi'].includes(object.kind);
      if (
        !visible(
          marker
            ? 'arMarkers'
            : ['vehicle', 'box'].includes(object.kind)
              ? 'arVolumes'
              : 'arRoutes',
        )
      )
        continue;
      const geometry = arGeometry(object);
      if (!geometry) continue;
      const los =
        options.arOcclusion === 'off' || !object.visibility
          ? undefined
          : validAt(object.visibility.at)
            ? object.visibility.state
            : 'unknown';
      if (los === 'occluded' && options.arOcclusion === 'hide') continue;
      const labelAlpha = ctx.globalAlpha;
      ctx.save();
      try {
        if (los === 'occluded') ctx.globalAlpha *= 0.55;
        const color = object.color ?? (object.selected ? theme.accent : theme.muted);
        let labelTop: number | undefined;
        let labelBottom: number | undefined;
        ctx.setLineDash(los === 'occluded' ? [3, 4] : object.kind === 'route' ? [7, 5] : []);
        for (const [a, b] of geometry.segments) {
          const projected = projectArSegment(a, b, ar.camera, w, h);
          if (projected) {
            path([...projected[0], ...projected[1]], color, object.selected ? 1.25 : 0.9, 1.2);
            labelTop = Math.min(labelTop ?? Infinity, projected[0][1], projected[1][1]);
            labelBottom = Math.max(labelBottom ?? -Infinity, projected[0][1], projected[1][1]);
          }
        }
        ctx.setLineDash(los === 'occluded' ? [3, 4] : []);
        const projected = projectArPoint(geometry.anchor, ar.camera, w, h);
        if (!projected) continue;
        const [x, y] = projected;
        if (marker) {
          if (object.kind === 'home')
            path(
              [
                x - 6,
                y,
                x,
                y - 6,
                x + 6,
                y,
                x + 4,
                y,
                x + 4,
                y + 6,
                x - 4,
                y + 6,
                x - 4,
                y,
                x - 6,
                y,
              ],
              color,
              1.2,
            );
          else if (object.kind === 'poi') circle(x, y, 5, color);
          else
            path(
              [x, y - 7, x + 6, y, x, y + 7, x - 6, y, x, y - 7],
              color,
              object.selected ? 1.6 : 1,
            );
        }
        if (!visible('arLabels')) continue;
        ctx.globalAlpha = labelAlpha;
        ctx.setLineDash([]);
        const distance = Math.hypot(...geometry.anchor.map((v, i) => v - ar.camera.position[i]!));
        const range =
          distance < 1000 ? `${Math.round(distance)} m` : `${(distance / 1000).toFixed(1)} km`;
        const status =
          los === 'occluded'
            ? `${marker ? '' : 'ANCHOR '}OCC · `
            : los === 'unknown'
              ? 'LOS ? · '
              : '';
        const label = `${status}${object.label.toUpperCase()} · ${range}`;
        ctx.font = `600 ${10 * 1.15}px ${theme.fontFamily}`;
        const labelWidth = Math.min(narrow ? 112 : 172, ctx.measureText(label).width);
        // Try above, then below; labels never cover another label or the centre sight.
        const firstOffset = labelTop === undefined ? -18 : Math.min(-18, labelTop - y - 10);
        const lowerOffset = labelBottom === undefined ? 18 : Math.max(18, labelBottom - y + 10);
        for (const offset of [firstOffset, lowerOffset, firstOffset - 16, lowerOffset + 16]) {
          const box = {
            x: x - labelWidth / 2 - 3,
            y: y + offset - 7,
            width: labelWidth + 6,
            height: 14,
          };
          if (
            box.x < left ||
            box.x + box.width > right ||
            box.y < top ||
            box.y + box.height > bottom ||
            labels.some(
              (b) =>
                box.x < b.x + b.width &&
                box.x + box.width > b.x &&
                box.y < b.y + b.height &&
                box.y + box.height > b.y,
            )
          )
            continue;
          labels.push(box);
          text(x, y + offset, label, 10, color, 'center', labelWidth);
          break;
        }
      } finally {
        ctx.restore();
      }
    }
    ctx.restore();
  }
  if (visible('frame'))
    for (const sx of [-1, 1])
      for (const sy of [-1, 1]) {
        const x = sx === -1 ? margin : w - margin,
          y = sy === -1 ? margin : h - margin;
        path(
          [x - sx * corner, y, x, y, x, y - sy * corner],
          alert?.severity === 'emergency' ? danger : theme.accent,
          1.7,
        );
      }
  if (visible('identity')) {
    text(
      margin + corner + 13,
      margin + 3,
      frame.label.toUpperCase(),
      11,
      theme.muted,
      'left',
      narrow ? w * 0.27 : w * 0.22,
    );
    text(
      w - margin - corner - 13,
      margin + 3,
      frame.source.toUpperCase(),
      11,
      theme.muted,
      'right',
    );
  }

  if (visible('heading')) {
    const heading = value(frame.headingDeg);
    const half = Math.min(
      narrow ? 94 : 225,
      w * 0.23,
      hasCamera ? Math.max(90, sensorRight - sensorWidth - cx - 16) : Infinity,
    );
    const top = narrow ? 60 : 32;
    const labelY = top + 23;
    const spacing = half / 80;
    ctx.font = `600 ${12 * 1.15}px ${theme.fontFamily}`;
    const boxWidth = Math.max(28, ctx.measureText('000°').width + 8);
    const labels: { left: number; right: number }[] = [
      { left: cx - boxWidth / 2 - 3, right: cx + boxWidth / 2 + 3 },
    ];
    const occupied: number[] = [cx];
    const cueX = (delta: number) => cx + Math.max(-half + 6, Math.min(half - 6, delta * spacing));
    function reserveLabel(label: string, x: number) {
      ctx.font = `600 ${9 * 1.15}px ${theme.fontFamily}`;
      const labelWidth = Math.min(56, ctx.measureText(label).width);
      const labelX = Math.max(cx - half + labelWidth / 2, Math.min(cx + half - labelWidth / 2, x));
      const interval = { left: labelX - labelWidth / 2 - 4, right: labelX + labelWidth / 2 + 4 };
      const showLabel = !labels.some(
        (other) => interval.left < other.right && interval.right > other.left,
      );
      if (showLabel) labels.push(interval);
      return { labelX, showLabel };
    }
    const desiredHeading = visible('targets') ? value(frame.targetHeadingDeg) : undefined;
    const headingRate = visible('trends') ? value(frame.headingRateDegS) : undefined;
    const targetDelta =
      heading !== undefined && desiredHeading !== undefined
        ? wrapHeading(desiredHeading - heading + 180) - 180
        : undefined;
    const trendDelta =
      heading !== undefined &&
      headingRate !== undefined &&
      Math.abs(headingRate * trendSeconds * spacing) >= 4
        ? headingRate * trendSeconds
        : undefined;
    const headingTarget =
      targetDelta === undefined
        ? undefined
        : {
            x: cueX(targetDelta),
            delta: targetDelta,
            label: `T ${angular(desiredHeading)}°`,
            ...reserveLabel(`T ${angular(desiredHeading)}°`, cueX(targetDelta)),
          };
    const headingTrend =
      trendDelta === undefined
        ? undefined
        : {
            x: cueX(trendDelta),
            delta: trendDelta,
            ...reserveLabel(`+${trendSeconds}s`, cueX(trendDelta)),
          };
    if (headingTarget) occupied.push(headingTarget.x);
    if (headingTrend) occupied.push(headingTrend.x);
    const markers =
      heading === undefined || !visible('bearingMarkers')
        ? []
        : (frame.bearingMarkers ?? [])
            .flatMap((marker) => {
              const bearing = value(marker.bearingDeg);
              return bearing === undefined
                ? []
                : [{ marker, delta: wrapHeading(bearing - heading + 180) - 180 }];
            })
            .sort(
              (a, b) =>
                Number(!!b.marker.selected) - Number(!!a.marker.selected) ||
                Math.abs(a.delta) - Math.abs(b.delta),
            )
            .flatMap(({ marker, delta }) => {
              const x = cueX(delta);
              if (occupied.some((other) => Math.abs(other - x) < 11)) return [];
              occupied.push(x);
              return [{ marker, delta, x, ...reserveLabel(marker.label, x) }];
            });
    if (heading !== undefined) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx - half, top - 2, half * 2, 40);
      ctx.clip();
      for (let i = -10; i <= 10; i++) {
        const tick = Math.round(heading / 10) * 10 + i * 10;
        const x = cx + (tick - heading) * spacing;
        const angle = wrapHeading(tick);
        const major = angle % 30 === 0;
        line(x, top, x, top + (major ? 12 : 6), theme.muted);
        if (
          major &&
          Math.abs(x - cx) < half - 14 &&
          !labels.some((box) => x + 11 > box.left && x - 11 < box.right)
        )
          text(
            x,
            labelY,
            ({ 0: 'N', 90: 'E', 180: 'S', 270: 'W' } as Record<number, string>)[angle] ??
              String(angle),
            10,
            theme.ink,
            'center',
          );
      }
      ctx.restore();
    }
    for (const { marker, delta, x, labelX, showLabel } of markers) {
      const my = top + 6;
      const color = marker.color ?? (marker.selected ? theme.accent : theme.muted);
      if (Math.abs(delta) > 80) {
        const dir = Math.sign(delta);
        path([x - dir * 3, my - 4, x + dir * 2, my, x - dir * 3, my + 4], color, 1.4);
      } else if (marker.symbol === 'home') {
        path(
          [
            x - 5,
            my,
            x,
            my - 5,
            x + 5,
            my,
            x + 3,
            my,
            x + 3,
            my + 5,
            x - 3,
            my + 5,
            x - 3,
            my,
            x - 5,
            my,
          ],
          color,
          1.2,
        );
      } else if (marker.symbol === 'circle') circle(x, my, 4, color);
      else if (marker.symbol === 'cross') {
        line(x - 4, my, x + 4, my, color, 1.2);
        line(x, my - 4, x, my + 4, color, 1.2);
      } else if (marker.symbol === 'triangle')
        path([x, my - 5, x + 5, my + 4, x - 5, my + 4, x, my - 5], color, 1.2);
      else
        path(
          [x, my - 5, x + 4, my, x, my + 5, x - 4, my, x, my - 5],
          color,
          marker.selected ? 1.8 : 1.2,
        );
      if (showLabel) text(labelX, labelY, marker.label, 9, color, 'center', 56);
    }
    if (headingTrend) {
      const x = headingTrend.x;
      ctx.setLineDash([3, 3]);
      line(cx, top - 4, x, top - 4, theme.ink, 1.2);
      ctx.setLineDash([]);
      line(x, top - 8, x, top, theme.ink, 1.4);
      if (Math.abs(headingTrend.delta) > 80) {
        const dir = Math.sign(headingTrend.delta);
        path([x - dir * 4, top - 7, x, top - 4, x - dir * 4, top - 1], theme.ink);
      }
      if (headingTrend.showLabel)
        text(headingTrend.labelX, labelY, `+${trendSeconds}s`, 9, theme.ink, 'center');
    }
    if (headingTarget) {
      const x = headingTarget.x;
      path([x, top, x - 4, top - 7, x + 4, top - 7, x, top], theme.accent, 1.4);
      if (Math.abs(headingTarget.delta) > 80) {
        const dir = Math.sign(headingTarget.delta);
        path([x - dir * 3, top + 2, x + dir * 2, top + 5, x - dir * 3, top + 8], theme.accent);
      }
      if (headingTarget.showLabel)
        text(headingTarget.labelX, labelY, headingTarget.label, 9, theme.accent, 'center');
    }
    const boxColor = readingColor(frame.headingDeg);
    line(cx, top - 4, cx, labelY - 9, boxColor, 1.4);
    const outline = [
      cx - boxWidth / 2,
      labelY - 9,
      cx + boxWidth / 2,
      labelY - 9,
      cx + boxWidth / 2,
      labelY + 9,
      cx - boxWidth / 2,
      labelY + 9,
      cx - boxWidth / 2,
      labelY - 9,
    ];
    ctx.beginPath();
    ctx.moveTo(outline[0]!, outline[1]!);
    for (let i = 2; i < outline.length; i += 2) ctx.lineTo(outline[i]!, outline[i + 1]!);
    ctx.closePath();
    ctx.fillStyle = theme.panel;
    ctx.fill();
    path(outline, boxColor, 1);
    text(cx, labelY, `${angular(heading)}°`, 12, boxColor, 'center');
  }

  function tape(
    x: number,
    number: number | undefined,
    title: string,
    unit: string,
    increment: number,
    right: boolean,
    signed = false,
    wrap = false,
    reading?: Reading,
    target?: number,
    rate?: number,
  ): void {
    const hasSupplement = hasRangefinder || hasCamera;
    const half = Math.min(h * 0.24, 180, hasSupplement ? Math.max(42, cy - 180) : Infinity),
      dir = right ? 1 : -1;
    const lowerHalf = right
      ? insetBox
        ? Math.min(half, insetBox.y - 24 - cy)
        : half
      : hasActuators
        ? Math.min(half, Math.max(42, h - (rotorLayout ? 250 : 225) - cy))
        : half;
    const tickX = x - dir * 6,
      labelX = x + dir * 9;
    text(x, cy - half - 20, title, 11, theme.accent, 'center');
    text(x, cy - half - 5, unit, 10, theme.muted, 'center');
    line(tickX, cy - half + 6, tickX, cy + lowerHalf, theme.muted);
    if (number !== undefined) {
      const stepPixels = Math.min(28, half / 4);
      for (let i = -12; i <= 12; i++) {
        const tick = (Math.floor(number / increment) + i) * increment,
          y = cy - ((tick - number) / increment) * stepPixels;
        if (
          y < cy - half + 6 ||
          y > cy + lowerHalf ||
          Math.abs(y - cy) < 23 ||
          (!signed && tick < 0)
        )
          continue;
        const major = Math.round(tick / increment) % 2 === 0;
        line(tickX, y, tickX + dir * (major ? 9 : 5), y, theme.muted);
        if (major)
          text(
            labelX + dir * 5,
            y,
            fmt(wrap ? wrapHeading(tick) : tick, increment < 1 ? 1 : 0),
            10,
            theme.ink,
            right ? 'left' : 'right',
          );
      }
    }
    valueBox(
      x,
      cy,
      wrap ? angular(number) : fmt(number, number !== undefined && Math.abs(number) >= 100 ? 0 : 1),
      62,
      readingColor(reading),
    );
    if (readingPhase(reading) !== 'valid')
      text(x, cy + 26, phaseLabel(reading), 9, readingColor(reading), 'center');
    if (right) path([x - 37, cy - 4, x - 32, cy, x - 37, cy + 4], theme.accent);
    else path([x + 37, cy - 4, x + 32, cy, x + 37, cy + 4], theme.accent);
    if (number === undefined || wrap) return;
    const top = cy - half + 12,
      end = cy + lowerHalf - 7;
    const position = (v: number) => cy - ((v - number) / increment) * Math.min(28, half / 4);
    const fit = (y: number) => Math.max(top, Math.min(end, y));
    const cueX = tickX - dir * 5;
    let trendY: number | undefined;
    if (visible('trends') && rate !== undefined && Number.isFinite(rate)) {
      const prediction = signed
        ? number + rate * trendSeconds
        : Math.max(0, number + rate * trendSeconds);
      const y = fit(position(prediction));
      if (Math.abs(y - cy) > 18) {
        trendY = y;
        ctx.setLineDash([3, 3]);
        line(cueX, cy + (y < cy ? -14 : 14), cueX, y, theme.ink, 1.2);
        ctx.setLineDash([]);
        line(cueX - 4, y, cueX + 4, y, theme.ink, 1.4);
        if (!narrow)
          text(cueX - dir * 10, y, `+${trendSeconds}s`, 8, theme.ink, right ? 'right' : 'left');
        tapeCueBoxes.push({
          x: right ? cueX - 44 : cueX - 6,
          y: Math.min(cy, y) - 8,
          width: 50,
          height: Math.abs(cy - y) + 16,
        });
      }
    }
    if (visible('targets') && target !== undefined && Number.isFinite(target)) {
      const rawY = position(target),
        y = fit(rawY),
        besideReadout = Math.abs(y - cy) < 20,
        tip = besideReadout ? x - dir * 31 : tickX;
      path([tip, y, tip - dir * 7, y - 5, tip - dir * 7, y + 5, tip, y], theme.accent, 1.4);
      // A chevron marks a target beyond the visible tape range.
      if (rawY !== y)
        path(
          [
            tip - 3,
            y + (rawY < y ? -6 : 6),
            tip,
            y + (rawY < y ? -9 : 9),
            tip + 3,
            y + (rawY < y ? -6 : 6),
          ],
          theme.accent,
        );
      if (!narrow && !besideReadout)
        text(
          tip - dir * 13,
          y + (trendY !== undefined && Math.abs(trendY - y) < 16 ? (y < cy ? 15 : -15) : 0),
          `T ${fmt(target, target >= 100 ? 0 : 1)}`,
          9,
          theme.accent,
          right ? 'right' : 'left',
        );
      tapeCueBoxes.push({ x: right ? tip - 72 : tip - 6, y: y - 24, width: 78, height: 48 });
    }
  }
  if (visible('tapes')) {
    const rawSpeed = value(speedReading);
    const speed = marine && rawSpeed !== undefined ? rawSpeed * 1.9438444924 : rawSpeed;
    const secondary = value(secondaryReading);
    const speedTarget = camera
      ? undefined
      : value(preset.speed === 'air' ? frame.targetAirSpeedMps : frame.targetGroundSpeedMps);
    const speedRate = camera
      ? undefined
      : value(preset.speed === 'air' ? frame.airAccelerationMps2 : frame.groundAccelerationMps2);
    let altitudeTarget = value(frame.targetAltitudeM);
    if (!frame.altitudeDatum || frame.targetAltitudeDatum !== frame.altitudeDatum) {
      const msl = value(frame.altitudeMslM);
      altitudeTarget =
        frame.altitudeDatum === 'REL HOME' &&
        frame.targetAltitudeDatum === 'MSL' &&
        msl !== undefined &&
        secondary !== undefined &&
        altitudeTarget !== undefined
          ? altitudeTarget - msl + secondary
          : undefined;
    }
    // Domain-specific ranges keep small motions readable without scale changes during a manoeuvre.
    const speedStep =
      preset.domain === 'underwater' ? 0.2 : preset.domain === 'ground' && !camera ? 0.5 : 1;
    const x = margin + (narrow ? 27 : 47);
    tape(
      x,
      speed,
      camera ? 'PAN' : marine ? 'SOG' : preset.speed === 'air' ? 'AIR SPD' : 'GND SPD',
      camera ? 'deg' : marine ? 'kn' : 'm/s',
      camera ? 10 : speedStep,
      false,
      camera,
      false,
      speedReading,
      speedTarget === undefined ? undefined : speedTarget * (marine ? 1.9438444924 : 1),
      speedRate === undefined ? undefined : speedRate * (marine ? 1.9438444924 : 1),
    );
    tape(
      w - x,
      secondary,
      camera
        ? 'TILT'
        : preset.secondary === 'depth'
          ? 'DEPTH'
          : preset.secondary === 'course'
            ? 'COG'
            : 'ALT',
      camera || preset.secondary === 'course'
        ? 'deg'
        : preset.secondary === 'depth'
          ? 'm · surface'
          : `m ${frame.altitudeDatum ?? ''}`,
      camera || preset.secondary === 'course'
        ? 10
        : secondary !== undefined && Math.abs(secondary) >= 20
          ? 10
          : 1,
      true,
      true,
      preset.secondary === 'course',
      secondaryReading,
      preset.secondary === 'altitude' ? altitudeTarget : undefined,
      preset.secondary === 'altitude' ? value(frame.climbMps) : undefined,
    );
  }

  const roll = value(frame.rollDeg),
    pitch = value(frame.pitchDeg);
  const attitude = visible('attitude') && preset.domain === 'air';
  const fov = options.verticalFovDeg ?? 55;
  const projectionValid = Number.isFinite(fov) && fov > 0 && fov < 180;
  if (attitude && roll !== undefined && pitch !== undefined && projectionValid) {
    ctx.save();
    ctx.beginPath();
    const ladderLeft = margin + (narrow ? 70 : 92),
      ladderRight = w - ladderLeft,
      ladderTop = visible('heading') ? (narrow ? 142 : 124) : margin + 28,
      ladderBottom = h - margin - 45;
    const exclusions: { x: number; y: number; width: number; height: number }[] = [...tapeCueBoxes];
    if (alert)
      exclusions.push({
        x: cx - noticeWidth / 2 - 5,
        y: messageY - 21,
        width: noticeWidth + 10,
        height: 48,
      });
    if (visible('guidance') && frame.guidance)
      exclusions.push({
        x: cx - noticeWidth / 2 - 5,
        y: guidanceY - 19,
        width: noticeWidth + 10,
        height: 66,
      });
    if (hasActuators) {
      const left = (rotorLayout ? 110 : 155) * schematicScale + 8,
        right = (rotorLayout ? 110 : airframe ? 110 : 145) * schematicScale + 8;
      exclusions.push({
        x: schematicX - left,
        y: schematicTop,
        width: left + right,
        height: schematicLegendY + 10 - schematicTop,
      });
    }
    if (insetBox)
      exclusions.push({
        x: insetBox.x - 8,
        y: insetBox.y - 20,
        width: insetBox.width + 16,
        height: insetBox.height + 28,
      });
    if (hasRangefinder || hasCamera)
      exclusions.push({
        x: sensorRight - sensorWidth - 8,
        y: 56,
        width: sensorWidth + 16,
        height: 80,
      });
    if (hasGps) exclusions.push({ x: gpsX - 8, y: systemsY - 9, width: 138, height: 34 });
    if (hasLink) exclusions.push({ x: linkX - 8, y: systemsY - 16, width: 160, height: 39 });
    if (visible('controls') && frame.controls && !narrow)
      for (const side of [-1, 1])
        exclusions.push({ x: cx + side * 165 - 27, y: h - 146, width: 54, height: 54 });
    ctx.rect(
      ladderLeft,
      ladderTop,
      ladderRight - ladderLeft,
      Math.max(0, ladderBottom - ladderTop),
    );
    ctx.clip();
    // Reserve only occupied instruments, leaving the rest of the camera available to the horizon.
    for (const box of exclusions) {
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.rect(box.x, box.y, box.width, box.height);
      ctx.clip('evenodd');
    }
    ctx.translate(cx, cy);
    const bank = (-roll * Math.PI) / 180;
    ctx.rotate(bank);
    const focalLength = h / (2 * Math.tan((fov * Math.PI) / 360));
    const span = narrow ? 42 : 62;
    for (let a = -80; a <= 80; a += 10) {
      const delta = ((pitch - a) * Math.PI) / 180;
      if (Math.abs(delta) >= Math.PI / 2) continue;
      const y = Math.tan(delta) * focalLength;
      if (a === 0) {
        for (const side of [-1, 1]) {
          const x1 = side * span * 0.6,
            x2 = side * span * 2.3;
          line(x1, y, x2, y, theme.accent);
        }
      } else {
        ctx.setLineDash(a < 0 ? [4, 4] : []);
        path([-span, y, -span * 0.5, y, -span * 0.5, y + (a > 0 ? 4 : -4)], theme.muted);
        path([span, y, span * 0.5, y, span * 0.5, y + (a > 0 ? 4 : -4)], theme.muted);
        ctx.setLineDash([]);
        for (const side of [-1, 1]) {
          const x = side * (span + 9);
          const corners = [x, x + side * 25].flatMap((px) =>
            [y - 9, y + 9].map((py) => ({
              x: cx + px * Math.cos(bank) - py * Math.sin(bank),
              y: cy + px * Math.sin(bank) + py * Math.cos(bank),
            })),
          );
          const left = Math.min(...corners.map((p) => p.x)),
            right = Math.max(...corners.map((p) => p.x)),
            top = Math.min(...corners.map((p) => p.y)),
            bottom = Math.max(...corners.map((p) => p.y));
          const fits =
            left > ladderLeft &&
            right < ladderRight &&
            top > ladderTop &&
            bottom < ladderBottom &&
            !exclusions.some(
              (box) =>
                left < box.x + box.width &&
                right > box.x &&
                top < box.y + box.height &&
                bottom > box.y,
            );
          if (fits) text(x, y, String(a), 10, theme.ink, side < 0 ? 'right' : 'left');
        }
      }
    }
    ctx.restore();
  }
  if (attitude && !projectionValid)
    text(cx, cy + 101, 'ATT PROJECTION -', 10, theme.warning, 'center');
  else if (attitude && (roll === undefined || pitch === undefined))
    text(cx, cy + 101, 'ATT -', 10, theme.warning, 'center');
  if (visible('reticle', true)) {
    const r = narrow ? 39 : 66,
      arm = 16;
    if (!attitude)
      for (const sx of [-1, 1])
        for (const sy of [-1, 1])
          path(
            [
              cx + sx * (r - arm),
              cy + sy * r,
              cx + sx * r,
              cy + sy * r,
              cx + sx * r,
              cy + sy * (r - arm),
            ],
            theme.accent,
            1.2,
          );
    circle(cx, cy, 9);
    line(cx - 28, cy, cx - 10, cy, theme.accent, 1.4);
    line(cx + 10, cy, cx + 28, cy, theme.accent, 1.4);
    line(cx, cy - 18, cx, cy - 10, theme.accent, 1.4);
    circle(cx, cy, 1.2);
  }
  if (!attitude && !camera && visible('attitude') && !narrow) {
    const ay = cy + 101;
    if (roll !== undefined && pitch !== undefined) {
      ctx.save();
      ctx.translate(cx, ay);
      ctx.rotate((-roll * Math.PI) / 180);
      const py = Math.max(-12, Math.min(12, pitch * 2));
      line(-27, py, -7, py, theme.muted);
      line(7, py, 27, py, theme.muted);
      ctx.restore();
      path([cx - 5, ay + 5, cx, ay, cx + 5, ay + 5], theme.accent);
      line(cx, ay - 17, cx, ay - 13, theme.muted);
    } else text(cx, ay, 'ATT -', 10, theme.warning, 'center');
  }
  if (camera && visible('optics'))
    text(cx, cy + 98, `OPTICS  ${fmt(value(frame.zoomRatio))}×`, 11, theme.ink, 'center');

  const heartbeatValid = frame.heartbeatAt === undefined || validAt(frame.heartbeatAt);
  const primary = camera
    ? [frame.panDeg, frame.tiltDeg]
    : [
        frame.headingDeg,
        speedReading,
        ...(preset.secondary === 'course' ? [] : [secondaryReading]),
      ];
  const critical = [
    ...primary,
    ...(!camera && visible('attitude') && (attitude || !narrow)
      ? [frame.rollDeg, frame.pitchDeg]
      : []),
  ];
  const readings = [
    ...critical,
    ...(frame.outputs ?? []).flatMap((o) => [o.command, o.feedback].filter((r) => r !== undefined)),
  ];
  if (frame.heartbeatAt !== undefined) readings.push({ value: 0, at: frame.heartbeatAt });
  const phases = readings.map(readingPhase);
  const statusLabel = phases.includes('future')
    ? 'CLOCK MISMATCH'
    : phases.includes('invalid')
      ? 'DATA INVALID'
      : phases.includes('stale')
        ? 'DATA STALE'
        : critical.every((r) => r === undefined)
          ? 'NO TELEMETRY'
          : phases.includes('missing')
            ? 'DATA PARTIAL'
            : 'DATA CURRENT';
  const current = statusLabel === 'DATA CURRENT';
  const mode = heartbeatValid
    ? `${frame.mode ?? 'MODE -'}${frame.armed === undefined ? '' : frame.armed ? ' · ARMED' : ' · DISARMED'}`
    : 'MODE -';
  if (
    visible('messages') &&
    !alert &&
    !(visible('guidance') && frame.guidance) &&
    (!current || frame.alert)
  )
    text(cx, narrow ? 124 : 105, frame.alert ?? statusLabel, 12, theme.warning, 'center', w * 0.7);

  if (alert) {
    const x = cx - noticeWidth / 2;
    ctx.fillStyle = theme.panel;
    ctx.fillRect(x, messageY - 18, noticeWidth, 42);
    line(x, messageY - 18, x, messageY + 24, alertColor, 2.5);
    const ix = x + 19,
      iy = messageY + 3;
    if (alert.severity === 'emergency')
      path(
        [
          ix - 4,
          iy - 10,
          ix + 4,
          iy - 10,
          ix + 10,
          iy - 4,
          ix + 10,
          iy + 4,
          ix + 4,
          iy + 10,
          ix - 4,
          iy + 10,
          ix - 10,
          iy + 4,
          ix - 10,
          iy - 4,
          ix - 4,
          iy - 10,
        ],
        alertColor,
      );
    else if (alert.severity === 'info') circle(ix, iy, 10, alertColor);
    else path([ix, iy - 11, ix + 11, iy + 9, ix - 11, iy + 9, ix, iy - 11], alertColor);
    text(ix, iy + 2, alert.severity === 'info' ? 'i' : '!', 13, alertColor, 'center');
    const source = alert.source ? ` · ${alert.source.toUpperCase()}` : '';
    text(
      x + 38,
      messageY - 6,
      `${alert.severity.toUpperCase()}${source}`,
      9,
      alertColor,
      'left',
      noticeWidth - 64,
    );
    text(x + 38, messageY + 11, alert.message, 12, theme.ink, 'left', noticeWidth - 49);
    if (alerts.length > 1)
      text(x + noticeWidth - 8, messageY - 6, `+${alerts.length - 1}`, 9, alertColor, 'right');
  }
  if (visible('guidance') && frame.guidance) {
    const x = cx - noticeWidth / 2,
      y = guidanceY;
    const color = guidance ? theme.accent : theme.warning;
    path([x + 7, y - 16, x, y - 16, x, y + 24, x + 7, y + 24], color);
    path(
      [
        x + noticeWidth - 7,
        y - 16,
        x + noticeWidth,
        y - 16,
        x + noticeWidth,
        y + 24,
        x + noticeWidth - 7,
        y + 24,
      ],
      color,
    );
    text(
      cx,
      y - 7,
      guidance ? (guidance.source ?? 'AUTOPILOT').toUpperCase() : 'AUTOPILOT',
      9,
      color,
      'center',
      noticeWidth - 20,
    );
    text(
      cx,
      y + 10,
      guidance?.instruction ??
        `GUIDANCE ${phaseLabel({ value: 0, at: frame.guidance.at, valid: frame.guidance.valid }) || 'NO DATA'}`,
      12,
      color,
      'center',
      noticeWidth - 20,
    );
    if (guidance?.detail)
      text(cx, y + 39, guidance.detail, 10, theme.ink, 'center', noticeWidth - 20);
  }

  // Schematic positions come from host configuration, never MAVLink channel order.
  const outputs: readonly ActuatorOutput[] = frame.outputs ?? [];
  if (visible('actuators') && outputs.length) {
    ctx.save();
    ctx.translate(schematicX, schematicLegendY - 8);
    ctx.scale(schematicScale, schematicScale);
    ctx.translate(-cx, -schematicLegendY);
    textScale = schematicScale;
    const rotorSpacing = outputs.length > 6 ? 70 : narrow ? 68 : 72;
    const sx = rotorLayout ? rotorSpacing : narrow && !airframe ? 83 : 96,
      sy = rotorLayout ? rotorSpacing : outputs.length > 6 ? 54 : 40;
    const legendY = h - (narrow ? 77 : 70);
    const lowerRotor = Math.max(0, ...outputs.map((o) => o.indicator?.position[1] ?? 0)) * sy;
    const oy = rotorLayout
      ? legendY - lowerRotor - (outputs.length > 6 ? 10 : 16) - 37
      : h - (narrow ? 143 : 137) - (outputs.length > 6 ? 24 : 0);
    const positioned = positionedOutputs;
    function artwork(d: string, color = theme.muted, fill = false, weight = 1): void {
      const shape = new Path2D(d);
      if (fill) {
        ctx.save();
        ctx.globalAlpha = 0.48;
        ctx.fillStyle = theme.panel;
        ctx.fill(shape);
        ctx.restore();
      }
      ctx.strokeStyle = outline;
      ctx.lineWidth = weight + 1.4;
      ctx.stroke(shape);
      ctx.strokeStyle = color;
      ctx.lineWidth = weight;
      ctx.stroke(shape);
    }
    if (positioned) {
      ctx.save();
      ctx.translate(cx, oy);
      if (preset.id === 'submarine') {
        // Inspection ROV: frame rails, pressure housing, flotation and camera dome.
        artwork(
          'M-40-35 Q-46-35-46-27 L-46 27 Q-46 35-38 35 L38 35 Q46 35 46 27 L46-27 Q46-35 38-35 Z',
          theme.muted,
          true,
          1.15,
        );
        for (const side of [-1, 1]) {
          ctx.save();
          ctx.scale(side, 1);
          artwork('M25-34 L35-34 L39-27 L39 26 L35 33 L25 33 Z', theme.muted, true, 0.8);
          artwork(
            'M42-25 L63-33 M42-19 L63-26 M42 19 L63 26 M42 25 L63 33',
            theme.muted,
            false,
            1.2,
          );
          artwork('M16-27 L36-27 M16 27 L36 27', theme.muted, false, 0.65);
          ctx.restore();
        }
        artwork(
          'M-10-28 Q-10-37 0-37 Q10-37 10-28 L10 28 Q10 34 0 34 Q-10 34-10 28 Z',
          theme.ink,
          true,
          0.9,
        );
        artwork('M-8-22 L8-22 M-8 21 L8 21 M-7-17 L-7 16 M7-17 L7 16', theme.muted, false, 0.65);
        artwork('M-7-37 L-7-43 Q0-50 7-43 L7-37', theme.accent, true, 0.9);
        artwork('M-21-38 L-25-43 M21-38 L25-43', theme.muted, false, 0.8);
      } else if (airframe) {
        // Swept-wing airframe with fuselage curvature, canopy, hinge lines and empennage.
        if (preset.id === 'vtol')
          for (const side of [-1, 1]) {
            // Only the exposed boom sections are visible; the wing covers their middle.
            const x = side * 44;
            line(x, -21, x, -5, theme.muted, 1.5);
            line(x, 17, x, 24, theme.muted, 1.5);
            for (const y of [-27, 30]) {
              circle(x, y, 6, theme.muted);
              line(x - 10, y, x + 10, y, theme.muted, 0.8);
              circle(x, y, 1.3, theme.ink);
            }
          }
        artwork(
          'M-7-19 L-22-14 L-78 9 Q-83 12-81 17 L-76 20 L-12 8 L-5 9 M7-19 L22-14 L78 9 Q83 12 81 17 L76 20 L12 8 L5 9',
          theme.ink,
          true,
          1.05,
        );
        artwork(
          'M-5 27 L-31 38 L-34 45 L-9 41 L0 45 L9 41 L34 45 L31 38 L5 27',
          theme.ink,
          true,
          1.05,
        );
        artwork(
          'M0-54 C-5-49-8-38-8-23 L-7 12 L-4 34 L-2 44 L2 44 L4 34 L7 12 L8-23 C8-38 5-49 0-54 Z',
          theme.ink,
          true,
          1.15,
        );
        artwork('M0-42 C-5-37-5-26-3-21 Q0-18 3-21 C5-26 5-37 0-42 Z', theme.accent, true, 0.85);
        artwork('M14 3 L70 14 M10 34 L26 40', theme.muted, false, 0.65);
      } else if (marine) {
        // Twin-hull USV with fine bows, bridge deck, sensor mast and stern drives.
        for (const side of [-1, 1]) {
          ctx.save();
          ctx.scale(side, 1);
          artwork(
            'M25-51 C17-43 14-28 14-13 L14 32 Q14 38 20 40 L29 40 Q34 38 34 32 L34-17 C34-32 31-44 25-51 Z',
            theme.ink,
            true,
            1.15,
          );
          artwork('M25-43 C20-31 19-19 19-9 L19 28 M30-13 L30 29', theme.muted, false, 0.65);
          artwork('M20 40 L20 47 L28 47 L28 40 M24 44 L24 51', theme.muted, true, 0.8);
          ctx.restore();
        }
        artwork('M-19-23 L19-23 L19 23 L-19 23 Z', theme.muted, true, 0.9);
        artwork('M-12-21 L12-21 L14-11 L12 9 L-12 9 L-14-11 Z', theme.ink, true, 0.9);
        artwork('M-10-17 L10-17 L11-11 L-11-11 Z', theme.accent, true, 0.75);
        artwork('M-9 12 L9 12 L9 20 L-9 20 Z M0-6 L0 7 M-7 0 L7 0', theme.muted, false, 0.75);
      } else if (preset.id === 'rover') {
        artwork(
          'M-24-35 Q-24-42-17-42 L17-42 Q24-42 24-35 L24 31 Q24 38 17 38 L-17 38 Q-24 38-24 31 Z',
          theme.ink,
          true,
          1.1,
        );
        artwork(
          'M-18-30 L18-30 L18-8 L-18-8 Z M-16-26 L16-26 M-18-3 L18-3 L18 27 L-18 27 Z',
          theme.muted,
          true,
          0.8,
        );
        for (const side of [-1, 1])
          for (const front of [-1, 1]) {
            ctx.save();
            ctx.scale(side, front);
            artwork('M25 15 L32 15 L32 30 L25 30 Z', theme.muted, true, 1);
            ctx.restore();
          }
        artwork('M-9-39 L-9-34 M9-39 L9-34', theme.accent, false, 1.5);
      } else if (preset.id === 'helicopter') {
        artwork(
          'M0-37 C-18-33-20-9-10 13 L-4 18 L-2 43 L-12 47 L-12 51 L0 47 L12 51 L12 47 L2 43 L4 18 L10 13 C20-9 18-33 0-37 Z',
          theme.ink,
          true,
          1,
        );
        artwork('M-9-25 Q0-35 9-25 L9-12 L-9-12 Z M0-30 L0 12', theme.muted, false, 0.7);
        artwork('M-45-5 L45-5 M0-44 L0 31', theme.muted, false, 1.3);
      } else if (preset.id === 'blimp') {
        artwork(
          'M0-52 C-50-48-50 33-9 45 L-14 52 L0 47 L14 52 L9 45 C50 33 50-48 0-52 Z',
          theme.ink,
          true,
          1.1,
        );
        artwork('M0-46 C-17-38-20 21 0 42 C20 21 17-38 0-46 M0-46 L0 42', theme.muted, false, 0.65);
      } else {
        for (const o of outputs) {
          const [px, py] = o.indicator!.position,
            x = px * sx,
            y = py * sy;
          const angle = Math.atan2(y, x),
            length = Math.hypot(x, y);
          ctx.save();
          ctx.rotate(angle);
          artwork(`M12-4 L${length - 12}-2 L${length - 12} 2 L12 4 Z`, theme.muted, true, 0.9);
          ctx.restore();
        }
        artwork('M0-23 L13-13 L13 10 L7 21 L-7 21 L-13 10 L-13-13 Z', theme.ink, true, 1.1);
        artwork('M0-17 L7-10 L7 6 L-7 6 L-7-10 Z', theme.muted, true, 0.8);
        artwork('M-5 13 L5 13 M-4-20 L4-20', theme.accent, false, 1.3);
      }
      ctx.restore();
    }
    const gauge = (
      output: ActuatorOutput,
      x: number,
      y: number,
      glyph: NonNullable<ActuatorOutput['indicator']>['glyph'],
    ) => {
      const commandColor = readingColor(output.command);
      const command = value(output.command),
        feedback = value(output.feedback);
      const denominator = Math.max(Math.abs(output.min), Math.abs(output.max));
      const fraction = (v: number) =>
        Number.isFinite(denominator) && denominator > 0
          ? Math.max(-1, Math.min(1, v / denominator))
          : 0;
      const short = output.indicator?.label;
      if (glyph === 'rotor' || glyph === 'thruster' || glyph === 'vertical') {
        const r = outputs.length > 6 ? 10 : glyph === 'vertical' ? 12 : 16;
        const gaugeAngle = (v: number) =>
          Math.PI * 0.75 +
          Math.max(0, Math.min(1, (v - output.min) / (output.max - output.min))) * Math.PI * 1.5;
        ctx.save();
        ctx.translate(x, y);
        // A static impeller identifies the actuator; its motion does not imply measured RPM.
        const disc = new Path2D();
        disc.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = theme.panel;
        ctx.globalAlpha = 0.6;
        ctx.fill(disc);
        ctx.globalAlpha = 1;
        circle(0, 0, r, theme.muted);
        circle(0, 0, r - 3, theme.muted);
        const bladeScale = (r - 4) / 12;
        ctx.save();
        ctx.scale(bladeScale, bladeScale);
        for (let blade = 0; blade < 3; blade++) {
          ctx.save();
          ctx.rotate((blade * Math.PI * 2) / 3);
          artwork(
            'M-1-2 C-4-7 0-12 6-11 Q11-10 10-6 C5-6 5-1 1 2 Z',
            theme.muted,
            true,
            0.75 / bladeScale,
          );
          ctx.restore();
        }
        ctx.restore();
        circle(0, 0, 2, theme.ink);
        ctx.restore();
        if (command !== undefined) {
          ctx.beginPath();
          ctx.arc(x, y, r + 3, gaugeAngle(0), gaugeAngle(command), command < 0);
          ctx.strokeStyle = outline;
          ctx.lineWidth = 4;
          ctx.stroke();
          ctx.strokeStyle = commandColor;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        if (feedback !== undefined) {
          const a = gaugeAngle(feedback);
          circle(x + Math.cos(a) * (r + 6), y + Math.sin(a) * (r + 6), 2, theme.ink);
        }
        if (glyph === 'vertical') {
          text(x, y + r + 13, fmt(command, 0), 10, commandColor, 'center');
          if (short) text(x, y - r - 10, short, 8, theme.muted, 'center');
        } else if (outputs.length > 6 || rotorLayout) {
          const angle = Math.atan2(y - oy, x - cx);
          text(
            x + Math.cos(angle) * (r + 17),
            y + Math.sin(angle) * (r + 17),
            fmt(command, 0),
            outputs.length > 6 ? 9 : 11,
            commandColor,
            'center',
          );
        } else {
          const left = x < cx;
          line(x + (left ? -1 : 1) * (r + 6), y, x + (left ? -1 : 1) * (r + 12), y, theme.muted);
          text(
            x + (left ? -1 : 1) * (r + 16),
            y,
            fmt(command, 0),
            11,
            commandColor,
            left ? 'right' : 'left',
          );
        }
      } else if (glyph === 'rudder' && airframe) {
        line(x, y, x, y + 21, theme.muted);
        if (command !== undefined) {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(-fraction(command) * 0.18);
          artwork('M-1 0 L-2 20 L2 20 L1 0 Z', commandColor, true, 1.2);
          ctx.restore();
        }
        if (feedback !== undefined)
          circle(
            x + Math.sin(fraction(feedback) * 0.18) * 24,
            y + Math.cos(fraction(feedback) * 0.18) * 24,
            2,
            theme.ink,
          );
        path([x + 9, y + 25, x + 30, y + 31, x + 38, y + 31], theme.muted);
        text(x + 44, y + 31, `R ${fmt(command, 0)}`, 10, commandColor);
      } else if (glyph === 'rudder') {
        const angle = (v: number) => -Math.PI / 2 + fraction(v) * Math.PI * 0.36;
        const r = 20;
        ctx.beginPath();
        ctx.arc(x, y, r, -Math.PI * 0.86, -Math.PI * 0.14);
        ctx.strokeStyle = outline;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.strokeStyle = theme.muted;
        ctx.lineWidth = 1;
        ctx.stroke();
        line(x, y - r - 3, x, y - r + 2, theme.muted);
        if (command !== undefined)
          line(
            x,
            y,
            x + Math.cos(angle(command)) * r,
            y + Math.sin(angle(command)) * r,
            commandColor,
            2,
          );
        if (feedback !== undefined)
          circle(
            x + Math.cos(angle(feedback)) * (r + 3),
            y + Math.sin(angle(feedback)) * (r + 3),
            2,
            theme.ink,
          );
        text(
          x,
          y + 12,
          `${fmt(command, output.unit === '°' ? 1 : 0)}${output.unit === '°' ? '°' : ''}`,
          11,
          commandColor,
          'center',
        );
        if (short && !marine && preset.id !== 'rover') text(x + 26, y - 4, short, 9, theme.muted);
      } else if (glyph === 'drive') {
        const half = 25;
        line(x - 3, y - half, x + 3, y - half, theme.muted);
        line(x - 3, y + half, x + 3, y + half, theme.muted);
        line(x, y - half, x, y + half, theme.muted);
        const zero = output.min < 0 ? y : y + half;
        const pos = (v: number) =>
          output.min < 0 ? y - fraction(v) * half : y + half - fraction(v) * half * 2;
        line(x - 4, zero, x + 4, zero, theme.muted);
        if (command !== undefined) line(x, zero, x, pos(command), commandColor, 4);
        if (feedback !== undefined) line(x - 5, pos(feedback), x + 5, pos(feedback), theme.ink, 2);
        text(x, y + half + 13, fmt(command, 0), 11, commandColor, 'center');
        if (short) text(x, y - half - 12, short, 10, theme.muted, 'center');
      } else {
        const aircraftSurface = airframe && (short === 'A' || short === 'E');
        const travel = aircraftSurface && short === 'E' ? 8 : 14;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(((output.indicator?.angleDeg ?? 0) * Math.PI) / 180);
        if (aircraftSurface) line(-travel - 2, 0, travel + 2, 0, theme.muted, 1.1);
        else {
          artwork('M-17-3 L17-3 L14 4 L-14 4 Z', theme.muted, true, 0.85);
          line(-15, -3, 15, -3, theme.ink, 0.7);
        }
        if (command !== undefined)
          path(
            [
              fraction(command) * travel - 3,
              aircraftSurface ? -5 : -7,
              fraction(command) * travel,
              aircraftSurface ? -1 : -3,
              fraction(command) * travel + 3,
              aircraftSurface ? -5 : -7,
            ],
            commandColor,
            1.6,
          );
        if (feedback !== undefined)
          line(fraction(feedback) * travel, -4, fraction(feedback) * travel, 4, theme.ink, 2);
        ctx.restore();
        if (aircraftSurface) {
          const tx = cx - (short === 'A' ? 107 : 65),
            ty = oy + (short === 'A' ? 15 : 53);
          if (short === 'A') line(tx + 4, ty, x - 20, y + 5, theme.muted);
          else path([tx + 4, ty, x - 15, ty, x - 9, y + 6], theme.muted);
          text(tx, ty, `${short} ${fmt(command, 0)}`, 10, commandColor, 'right');
        } else {
          const left = x < cx,
            tx = x + (left ? -23 : 23),
            align = left ? 'right' : 'left';
          if (short) text(tx, y - 9, short, 8, theme.muted, align, 38);
          text(tx, y + (short ? 9 : 0), fmt(command, 0), 11, commandColor, align);
        }
      }
    };
    for (const [i, output] of outputs.entries()) {
      const position = positioned
        ? output.indicator!.position
        : [
            ((i % 4) - 1.5) * 0.65,
            (Math.floor(i / 4) - Math.floor((outputs.length - 1) / 4) / 2) * 0.8,
          ];
      gauge(
        output,
        cx + position[0]! * sx,
        oy + position[1]! * sy,
        positioned ? output.indicator!.glyph : 'rotor',
      );
    }
    textScale = 1;
    ctx.restore();
    ctx.save();
    ctx.translate(schematicX - cx, 0);
    const hasFeedback = outputs.some((o) => value(o.feedback) !== undefined);
    line(cx - 85, legendY, cx - 72, legendY, theme.accent, 2);
    text(cx - 65, legendY, 'CMD', 9, theme.muted);
    circle(cx - 24, legendY, 2, theme.ink);
    text(cx - 16, legendY, hasFeedback ? 'FBK' : 'FBK -', 9, theme.muted);
    text(cx + 85, legendY, '%', 9, theme.muted, 'right');
    ctx.restore();
  } else if (visible('actuators') && frame.actuators) {
    ctx.save();
    ctx.translate(schematicX, schematicLegendY - 8);
    ctx.scale(schematicScale, schematicScale);
    ctx.translate(-cx, -schematicLegendY);
    textScale = schematicScale;
    const bank = frame.actuators,
      items = bank.items.slice(0, 16),
      cols = Math.min(8, items.length);
    for (const [i, motor] of items.entries()) {
      const x = cx + ((i % cols) - (cols - 1) / 2) * 30,
        y = h - 105 - Math.floor(i / cols) * 32;
      circle(x, y, 12, theme.muted);
      if (validAt(bank.at) && Number.isFinite(motor.fraction)) {
        ctx.beginPath();
        ctx.arc(
          x,
          y,
          12,
          -Math.PI / 2,
          -Math.PI / 2 + Math.max(0, Math.min(1, motor.fraction)) * Math.PI * 2,
        );
        ctx.strokeStyle = theme.accent;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      text(x, y, motor.label, 9, theme.ink, 'center', 21);
    }
    textScale = 1;
    ctx.restore();
  }
  if (visible('controls') && frame.controls && !narrow) {
    const input = frame.controls;
    for (const [i, axes] of [input.left, input.right].entries()) {
      const x = cx + (i === 0 ? -165 : 165),
        y = h - 119,
        r = 20;
      circle(x, y, r, theme.muted);
      line(x - r, y, x + r, y, theme.muted);
      line(x, y - r, x, y + r, theme.muted);
      if (validAt(input.at) && axes.every(Number.isFinite))
        circle(
          x + Math.max(-1, Math.min(1, axes[0])) * r,
          y - Math.max(-1, Math.min(1, axes[1])) * r,
          3,
        );
    }
  }

  const bottom = h - margin - 4;
  if (!narrow) {
    if (visible('position')) {
      text(margin + corner + 12, bottom - 16, `LAT  ${fmt(value(frame.latitudeDeg), 5)}°`, 11);
      text(margin + corner + 12, bottom, `LON  ${fmt(value(frame.longitudeDeg), 5)}°`, 11);
    }
    if (visible('status')) {
      text(cx, bottom - 16, mode, 12, theme.ink, 'center');
      text(cx, bottom, statusLabel, 10, current ? theme.accent : theme.warning, 'center');
    }
  } else {
    if (visible('status')) text(cx, bottom - 29, mode, 11, theme.ink, 'center');
    if (visible('status'))
      text(cx, bottom + 3, statusLabel, 10, current ? theme.accent : theme.warning, 'center');
  }
  if (visible('power')) {
    const right = w - margin - corner - (narrow ? 10 : 12);
    const bw = narrow ? 48 : 80;
    const bx = right - bw - 38;
    const by = bottom - (narrow ? 13 : 10);
    const battery = value(frame.batteryPct);
    const color = readingColor(frame.batteryPct);
    const bolt = [
      bx - 14,
      by - 8,
      bx - 20,
      by + 1,
      bx - 15,
      by + 1,
      bx - 18,
      by + 8,
      bx - 9,
      by - 2,
      bx - 14,
      by - 2,
      bx - 11,
      by - 8,
      bx - 14,
      by - 8,
    ];
    path(bolt, color, 1);
    ctx.fillStyle = color;
    ctx.fill();
    path([bx, by - 6, bx, by + 6, bx + bw, by + 6, bx + bw, by - 6], theme.muted, 1);
    if (battery !== undefined) {
      ctx.fillStyle = theme.accent;
      ctx.fillRect(bx + 3, by - 4, (bw - 6) * Math.max(0, Math.min(1, battery / 100)), 8);
    }
    text(right, by, `${fmt(battery, 0)}%`, narrow ? 10 : 12, color, 'right');
  }
  if (hasGps) {
    const x = gpsX,
      y = systemsY;
    const fix = value(frame.gpsFix);
    const fixName =
      ['NO GPS', 'NO FIX', '2D', '3D', 'DGPS', 'RTK FLOAT', 'RTK FIX', 'STATIC', 'PPP'][
        fix ?? -1
      ] ?? (fix === undefined ? phaseLabel(frame.gpsFix) : 'UNKNOWN');
    const color =
      fix === undefined ? readingColor(frame.gpsFix) : fix < 3 ? theme.warning : theme.accent;
    // Satellite body and solar panels share the first text baseline.
    ctx.save();
    ctx.translate(x + 8, y);
    ctx.rotate(-Math.PI / 4);
    path([-3, -4, 3, -4, 3, 4, -3, 4, -3, -4], theme.muted);
    path([-5, -3, -9, -3, -9, 3, -5, 3, -5, -3], theme.muted);
    path([5, -3, 9, -3, 9, 3, 5, 3, 5, -3], theme.muted);
    line(-5, 0, -3, 0, theme.muted);
    line(3, 0, 5, 0, theme.muted);
    ctx.restore();
    text(x + 24, y, fmt(value(frame.gpsSatellites), 0), 11, readingColor(frame.gpsSatellites));
    line(x + 44, y - 5, x + 44, y + 5, theme.muted, 0.7);
    text(x + 52, y, fixName, 10, color, 'left', 74);
    text(x + 24, y + 15, `HDOP ${fmt(value(frame.gpsHdop))}`, 9, theme.muted);
  }
  if (hasLink) {
    const x = linkX,
      y = systemsY;
    const rc = value(frame.rcSignalPct);
    for (let i = 0; i < 4; i++)
      line(
        x + i * 4,
        y + 3,
        x + i * 4,
        y + 3 - (i + 1) * 3,
        rc !== undefined && rc >= (i + 1) * 25 ? theme.accent : theme.muted,
        2,
      );
    text(
      x + 25,
      y,
      frame.rcSignalPct ? `RC ${fmt(rc, 0)}%` : `RC ${fmt(value(frame.rcRssi), 0)} raw`,
      11,
      readingColor(frame.rcSignalPct ?? frame.rcRssi),
    );
    text(
      x + 25,
      y + 15,
      `RAD ${fmt(value(frame.radioRssi), 0)} / ${fmt(value(frame.radioRemoteRssi), 0)} raw`,
      10,
      theme.muted,
      'left',
      125,
    );
  }
  if (hasHealth && frame.sensorHealth) {
    const x = healthX,
      y = healthY;
    const fresh = validAt(frame.sensorHealth.at);
    const fault = frame.sensorHealth.items.find((item) => item.state === 'fault');
    const count = frame.sensorHealth.items.filter((item) => item.state === 'fault').length;
    const color = !fresh ? theme.warning : fault ? danger : theme.accent;
    path([x, y, x + 4, y, x + 7, y - 6, x + 10, y + 5, x + 13, y, x + 17, y], color);
    const label = !fresh
      ? `SYS ${phaseLabel({ value: 0, at: frame.sensorHealth.at })}`
      : fault
        ? `${fault.label} FAULT${count > 1 ? ` +${count - 1}` : ''}`
        : `SYS ${frame.sensorHealth.items.filter((item) => item.state === 'ok').length} OK`;
    text(x + 25, y, label, 10, color, 'left', 90);
    const disabled = frame.sensorHealth.items.filter((item) => item.state === 'disabled').length;
    if (fresh && disabled) text(x + 25, y + 15, `${disabled} OFF`, 9, theme.muted);
  }
  if (hasRangefinder && rangefinder) {
    const x = sensorRight - sensorWidth,
      y = 108;
    const color = readingColor(rangefinder.distanceM);
    line(x, y - 5, x, y + 5, color);
    line(x + 15, y - 5, x + 15, y + 5, color);
    line(x, y, x + 15, y, color);
    path([x + 4, y - 3, x + 1, y, x + 4, y + 3], color);
    path([x + 11, y - 3, x + 14, y, x + 11, y + 3], color);
    text(x + 25, y, `${rangefinder.direction} RNG`, 10, theme.muted, 'left', 88);
    text(sensorRight, y, `${fmt(value(rangefinder.distanceM))} m`, 14, color, 'right');
    const detail =
      readingPhase(rangefinder.distanceM) === 'valid'
        ? (rangefinder.technology ?? 'unknown').toUpperCase()
        : phaseLabel(rangefinder.distanceM);
    text(x + 25, y + 17, detail, 9, color, 'left', 95);
    const quality = value(rangefinder.qualityPct);
    if (quality !== undefined)
      text(sensorRight, y + 17, `Q ${fmt(quality, 0)}%`, 9, theme.muted, 'right');
  }
  if (hasCamera && frame.camera) {
    const x = sensorRight - sensorWidth,
      y = 66;
    const payload = frame.camera;
    const fresh = payload.at !== undefined && validAt(payload.at);
    const color = fresh ? theme.accent : theme.warning;
    path(
      [
        x,
        y - 5,
        x + 4,
        y - 5,
        x + 6,
        y - 8,
        x + 11,
        y - 8,
        x + 13,
        y - 5,
        x + 17,
        y - 5,
        x + 17,
        y + 6,
        x,
        y + 6,
        x,
        y - 5,
      ],
      color,
    );
    circle(x + 8.5, y + 0.5, 3, color);
    text(
      x + 25,
      y,
      fresh
        ? `${payload.mode ?? 'CAM'}${payload.palette ? ` · ${payload.palette}` : ''}`
        : 'CAM UNAVAILABLE',
      10,
      color,
      'left',
      sensorWidth - 63,
    );
    const recording = value(payload.recording);
    if (recording !== undefined)
      text(
        sensorRight,
        y,
        recording > 0 ? 'REC' : 'IDLE',
        9,
        recording > 0 ? theme.accent : theme.muted,
        'right',
      );
    if (payload.minC || payload.maxC || payload.spotC)
      text(
        x + 25,
        y + 18,
        payload.spotC
          ? `SPOT ${fmt(value(payload.spotC))}°C`
          : `${fmt(value(payload.minC))} / ${fmt(value(payload.maxC))}°C MIN/MAX`,
        10,
        theme.muted,
        'left',
        sensorWidth - 25,
      );
  }
  if (insetBox && options.inset) {
    const inset = options.inset;
    const { x, y, width: iw, height: ih } = insetBox;
    if (inset.valid !== false && validAt(inset.at)) {
      if (inset.crop) ctx.drawImage(inset.image, ...inset.crop, x, y, iw, ih);
      else ctx.drawImage(inset.image, x, y, iw, ih);
    }
    text(x, y - 10, inset.label, 10, theme.muted, 'left', iw);
  }
  ctx.restore();
}
