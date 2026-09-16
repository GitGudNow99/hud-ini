import type { ServoOutputMapping } from '../src/adapters.js';
import type { VehiclePreset } from '../src/index.js';

/** Illustrative fixture wiring only. Real installations must supply their own mapping. */
export function scenarioOutputs(preset: VehiclePreset, mavType: number): ServoOutputMapping[] {
  const output = (
    id: string,
    label: string,
    kind: ServoOutputMapping['kind'] = 'axis',
    degrees = false,
  ): Omit<ServoOutputMapping, 'channel'> => ({
    id,
    label,
    kind,
    unit: degrees ? '°' : '%',
    min: kind === 'propulsion' && preset.domain === 'air' ? 0 : degrees ? -35 : -100,
    max: degrees ? 35 : 100,
    pwmMin: 1000,
    pwmMax: 2000,
    pwmNeutral: kind === 'propulsion' && preset.domain === 'air' ? undefined : 1500,
  });
  let items: Omit<ServoOutputMapping, 'channel'>[];
  switch (preset.id) {
    case 'boat':
      items = [
        output('rudder', 'Rudder', 'steering', true),
        output('port', 'Port drive', 'propulsion'),
        output('starboard', 'Stbd drive', 'propulsion'),
      ];
      break;
    case 'rover':
      items = [
        output('steering', 'Steering', 'steering', true),
        output('drive', 'Drive', 'propulsion'),
      ];
      break;
    case 'plane':
    case 'vtol':
      items = [
        output('aileron', 'Aileron'),
        output('elevator', 'Elevator'),
        output('rudder', 'Rudder'),
        output('throttle', 'Throttle', 'propulsion'),
      ];
      break;
    case 'helicopter':
      items = [
        output('swash1', 'Swash 1'),
        output('swash2', 'Swash 2'),
        output('swash3', 'Swash 3'),
        output('tail', 'Tail'),
      ];
      break;
    case 'submarine':
      items = ['Fwd port', 'Fwd stbd', 'Aft port', 'Aft stbd', 'Vertical 1', 'Vertical 2'].map(
        (label, i) => output(`thruster${i + 1}`, label, 'propulsion'),
      );
      break;
    case 'tracker':
      return [];
    case 'blimp':
      items = ['Lateral', 'Forward', 'Vertical', 'Yaw'].map((label) =>
        output(label.toLowerCase(), label),
      );
      break;
    default: {
      const count =
        ({ 13: 6, 14: 8, 15: 3, 29: 12, 35: 10 } as Record<number, number>)[mavType] ?? 4;
      items = Array.from({ length: count }, (_, i) =>
        output(`motor${i + 1}`, `M${i + 1}`, 'propulsion'),
      );
    }
  }
  return items.map((item, i) => {
    let indicator: ServoOutputMapping['indicator'];
    if (preset.id === 'submarine') {
      const positions = [
        [-0.78, -0.72],
        [0.78, -0.72],
        [-0.78, 0.72],
        [0.78, 0.72],
        [-0.28, 0],
        [0.28, 0],
      ] as const;
      indicator = {
        position: positions[i]!,
        glyph: i < 4 ? 'thruster' : 'vertical',
        label: i < 4 ? undefined : `V${i - 3}`,
      };
    } else if (preset.id === 'boat' || preset.id === 'rover') {
      indicator = {
        position:
          i === 0 ? [0, 0.75] : preset.id === 'rover' ? [0.8, 0] : [i === 1 ? -0.8 : 0.8, 0],
        glyph: i === 0 ? 'rudder' : 'drive',
        label:
          i === 0
            ? 'RUD'
            : i === 1 && preset.id === 'boat'
              ? 'P'
              : preset.id === 'boat'
                ? 'S'
                : undefined,
      };
    } else if (preset.id === 'plane' || preset.id === 'vtol') {
      const positions = [
        [-0.55, 0.3],
        [-0.2, 0.95],
        [0, 0.55],
        [1, -0.1],
      ] as const;
      indicator = {
        position: positions[i]!,
        glyph: i === 2 ? 'rudder' : i === 3 ? 'drive' : 'surface',
        label: ['A', 'E', 'R', 'T'][i],
        angleDeg: i === 0 ? -11 : 0,
      };
    } else if (preset.id === 'multirotor' || preset.id === 'generic') {
      const angle = -Math.PI / 2 + Math.PI / items.length + (i * Math.PI * 2) / items.length;
      indicator = {
        position: [Math.cos(angle) * 0.78, Math.sin(angle) * 0.78],
        glyph: 'rotor',
      };
    } else {
      indicator = {
        position: [(i % 2 ? 1 : -1) * 0.68, (Math.floor(i / 2) ? 1 : -1) * 0.62],
        glyph: item.kind === 'propulsion' ? 'rotor' : 'surface',
        label: item.label.toUpperCase().replace('SWASH ', 'S').slice(0, 4),
      };
    }
    return { ...item, channel: i + 1, indicator };
  });
}
