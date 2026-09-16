export type VehiclePresetId =
  | 'multirotor'
  | 'helicopter'
  | 'plane'
  | 'vtol'
  | 'rover'
  | 'boat'
  | 'submarine'
  | 'tracker'
  | 'blimp'
  | 'ptz'
  | 'generic';
export interface VehiclePreset {
  id: VehiclePresetId;
  label: string;
  family: 'copter' | 'plane' | 'rover' | 'sub' | 'tracker' | 'blimp' | 'camera' | 'generic';
  domain: 'air' | 'ground' | 'surface' | 'underwater' | 'camera';
  mavTypes: readonly number[];
  speed: 'ground' | 'air' | 'knots';
  secondary: 'altitude' | 'course' | 'depth' | 'pan';
}
export const vehiclePresets: readonly VehiclePreset[] = [
  {
    id: 'multirotor',
    label: 'Multirotor',
    family: 'copter',
    domain: 'air',
    mavTypes: [2, 13, 14, 15, 29, 35, 43],
    speed: 'ground',
    secondary: 'altitude',
  },
  {
    id: 'helicopter',
    label: 'Helicopter',
    family: 'copter',
    domain: 'air',
    mavTypes: [3, 4],
    speed: 'air',
    secondary: 'altitude',
  },
  {
    id: 'plane',
    label: 'Fixed wing',
    family: 'plane',
    domain: 'air',
    mavTypes: [1],
    speed: 'air',
    secondary: 'altitude',
  },
  {
    id: 'vtol',
    label: 'VTOL / QuadPlane',
    family: 'plane',
    domain: 'air',
    mavTypes: [19, 20, 21, 22, 23, 24, 25, 47],
    speed: 'air',
    secondary: 'altitude',
  },
  {
    id: 'rover',
    label: 'Rover',
    family: 'rover',
    domain: 'ground',
    mavTypes: [10],
    speed: 'ground',
    secondary: 'course',
  },
  {
    id: 'boat',
    label: 'USV / boat',
    family: 'rover',
    domain: 'surface',
    mavTypes: [11],
    speed: 'knots',
    secondary: 'course',
  },
  {
    id: 'submarine',
    label: 'Submarine / ROV',
    family: 'sub',
    domain: 'underwater',
    mavTypes: [12],
    speed: 'ground',
    secondary: 'depth',
  },
  {
    id: 'tracker',
    label: 'Antenna tracker',
    family: 'tracker',
    domain: 'ground',
    mavTypes: [5],
    speed: 'ground',
    secondary: 'pan',
  },
  {
    id: 'blimp',
    label: 'Blimp / airship',
    family: 'blimp',
    domain: 'air',
    mavTypes: [7],
    speed: 'air',
    secondary: 'altitude',
  },
  {
    id: 'ptz',
    label: 'PTZ camera',
    family: 'camera',
    domain: 'camera',
    mavTypes: [26, 30],
    speed: 'ground',
    secondary: 'pan',
  },
  {
    id: 'generic',
    label: 'Generic vehicle',
    family: 'generic',
    domain: 'air',
    mavTypes: [0],
    speed: 'ground',
    secondary: 'altitude',
  },
];
export function presetForMavType(type: number): VehiclePreset {
  return (
    vehiclePresets.find((preset) => preset.mavTypes.includes(type)) ??
    vehiclePresets[vehiclePresets.length - 1]!
  );
}
