import type { ActuatorOutput, HudAlert, HudFrame, Reading } from './types.js';
import { presetForMavType } from './presets.js';
import { readValue, wrapHeading } from './telemetry.js';

/** Decoded fields retain canonical snake_case MAVLink names and wire units. */
export interface MavlinkEnvelope {
  systemId: number;
  componentId: number;
  time: number;
  message: string;
  fields: Record<string, number>;
  /** STATUSTEXT wire field. Bytes preserve UTF-8 characters split between chunks. */
  text?: string | Uint8Array;
}
/** Host-supplied channel assignment and calibration; never inferred from vehicle type. */
export interface ServoOutputMapping extends Omit<ActuatorOutput, 'command' | 'feedback'> {
  channel: number;
  port?: number;
  pwmMin: number;
  pwmMax: number;
  pwmNeutral?: number;
  reversed?: boolean;
}
export interface MavlinkOptions {
  systemId: number;
  componentId?: number;
  label?: string;
  depthOriginM?: number;
  servoOutputs?: readonly ServoOutputMapping[];
  /** Required to ingest camera messages. Camera sources never update vehicle attitude or mode. */
  camera?: { componentId: number; deviceId: number; streamId: number };
  /** Optional radio component; defaults to the selected autopilot component. */
  radioComponentId?: number;
}
const modes: Record<string, Record<number, string>> = {
  copter: {
    0: 'STABILIZE',
    2: 'ALT HOLD',
    3: 'AUTO',
    4: 'GUIDED',
    5: 'LOITER',
    6: 'RTL',
    9: 'LAND',
    16: 'POSHOLD',
  },
  plane: {
    0: 'MANUAL',
    5: 'FBWA',
    10: 'AUTO',
    11: 'RTL',
    12: 'LOITER',
    15: 'GUIDED',
    17: 'QSTABILIZE',
    18: 'QHOVER',
    19: 'QLOITER',
    20: 'QLAND',
  },
  rover: {
    0: 'MANUAL',
    1: 'ACRO',
    3: 'STEERING',
    4: 'HOLD',
    5: 'LOITER',
    10: 'AUTO',
    11: 'RTL',
    15: 'GUIDED',
  },
  sub: {
    0: 'STABILIZE',
    2: 'DEPTH HOLD',
    3: 'AUTO',
    4: 'GUIDED',
    7: 'CIRCLE',
    16: 'POSHOLD',
    19: 'MANUAL',
  },
  tracker: { 0: 'MANUAL', 1: 'STOP', 2: 'SCAN', 10: 'AUTO' },
  blimp: { 0: 'LAND', 1: 'MANUAL', 2: 'VELOCITY', 3: 'LOITER', 4: 'RTL' },
};

/** One instance per system/component. The host owns transport and clock alignment. */
export class MavlinkTelemetry {
  private frame: HudFrame;
  private lastMessageTime = new Map<string, number>();
  private statusChunks = new Map<
    number,
    { bytes: number[]; next: number; at: number; severity: number }
  >();
  private alertSequence = 0;
  private autopilot?: number;
  private speedSamples = new Map<string, Reading>();
  /** Set once GLOBAL_POSITION_INT supplies altitude, which then owns the altitude readings. */
  private hasGlobalAltitude = false;
  constructor(private readonly identity: MavlinkOptions) {
    const ids = new Set<string>();
    for (const m of identity.servoOutputs ?? []) {
      if (
        ids.has(m.id) ||
        !Number.isInteger(m.channel) ||
        m.channel < 1 ||
        m.channel > 16 ||
        ![m.min, m.max, m.pwmMin, m.pwmMax].every(Number.isFinite) ||
        m.min >= m.max ||
        m.pwmMin >= m.pwmMax ||
        (m.pwmNeutral !== undefined &&
          !(m.pwmNeutral > m.pwmMin && m.pwmNeutral < m.pwmMax && m.min < 0 && m.max > 0))
      )
        throw new Error(`Invalid servo calibration: ${m.id}`);
      ids.add(m.id);
    }
    this.frame = {
      time: 0,
      source: 'live',
      label: identity.label ?? `VEHICLE ${identity.systemId}`,
      outputs: identity.servoOutputs?.map(({ id, label, unit, min, max, kind, indicator }) => ({
        id,
        label,
        unit,
        min,
        max,
        kind,
        indicator,
      })),
    };
  }
  ingest(packet: MavlinkEnvelope): boolean {
    const cameraMessage = [
      'VIDEO_STREAM_STATUS',
      'CAMERA_THERMAL_RANGE',
      'CAMERA_CAPTURE_STATUS',
    ].includes(packet.message);
    const selectedCamera = this.identity.camera;
    const matchesComponent = cameraMessage
      ? selectedCamera !== undefined &&
        packet.componentId === selectedCamera.componentId &&
        (packet.fields.camera_device_id ?? 0) === selectedCamera.deviceId &&
        (packet.message === 'CAMERA_CAPTURE_STATUS' ||
          packet.fields.stream_id === selectedCamera.streamId)
      : packet.componentId ===
        (packet.message === 'RADIO_STATUS'
          ? (this.identity.radioComponentId ?? this.identity.componentId ?? 1)
          : (this.identity.componentId ?? 1));
    const messageKey =
      packet.message === 'SERVO_OUTPUT_RAW'
        ? `${packet.message}:${packet.fields.port}`
        : packet.message === 'DISTANCE_SENSOR'
          ? `${packet.message}:${packet.fields.id}`
          : packet.message;
    if (
      packet.systemId !== this.identity.systemId ||
      !matchesComponent ||
      !Number.isFinite(packet.time) ||
      packet.time < (this.lastMessageTime.get(messageKey) ?? -Infinity)
    )
      return false;
    const previous = { ...this.frame };
    const f = packet.fields,
      at = packet.time;
    const r = (value: number | undefined, valid = true): Reading => ({
      value: value ?? NaN,
      at,
      valid: valid && value !== undefined && Number.isFinite(value),
    });
    const scaled = (key: string, scale: number, valid = true) =>
      r(f[key] === undefined ? undefined : f[key]! * scale, valid);
    switch (packet.message) {
      case 'STATUSTEXT': {
        const alert = this.statusText(packet);
        if (alert === false) return false;
        if (alert)
          this.frame.alerts = [
            ...(this.frame.alerts ?? []).filter(
              (a) =>
                at < (a.expiresAt ?? a.at + 10) &&
                !(a.message === alert.message && a.severity === alert.severity),
            ),
            alert,
          ].slice(-16);
        break;
      }
      case 'HEARTBEAT': {
        this.autopilot = f.autopilot;
        this.frame.vehicleType = f.type;
        this.frame.heartbeatAt = at;
        this.frame.armed = ((f.base_mode ?? 0) & 128) !== 0;
        const family = presetForMavType(f.type ?? -1).family;
        this.frame.mode =
          f.autopilot === 3 && ((f.base_mode ?? 0) & 1) !== 0
            ? (modes[family]?.[f.custom_mode ?? -1] ?? `MODE ${f.custom_mode ?? '-'}`)
            : f.autopilot === 3
              ? 'BASE MODE'
              : `AUTOPILOT ${f.autopilot ?? '-'}`;
        break;
      }
      case 'ATTITUDE':
        this.frame.rollDeg = scaled('roll', 180 / Math.PI);
        this.frame.pitchDeg = scaled('pitch', 180 / Math.PI);
        this.frame.turnRateDegS = scaled('yawspeed', 180 / Math.PI);
        this.frame.headingRateDegS = r(
          [f.roll, f.pitch, f.pitchspeed, f.yawspeed].every(
            (v) => v !== undefined && Number.isFinite(v),
          ) && Math.abs(Math.cos(f.pitch!)) > 0.1
            ? ((Math.sin(f.roll!) * f.pitchspeed! + Math.cos(f.roll!) * f.yawspeed!) /
                Math.cos(f.pitch!)) *
                (180 / Math.PI)
            : undefined,
        );
        this.frame.headingDeg = r(
          f.yaw === undefined ? undefined : wrapHeading((f.yaw * 180) / Math.PI),
        );
        if (this.frame.vehicleType === 5) {
          this.frame.panDeg = this.frame.headingDeg;
          this.frame.tiltDeg = this.frame.pitchDeg;
        }
        break;
      case 'GLOBAL_POSITION_INT': {
        this.frame.latitudeDeg = scaled('lat', 1e-7);
        this.frame.longitudeDeg = scaled('lon', 1e-7);
        this.frame.altitudeM = scaled('relative_alt', 0.001);
        this.frame.altitudeMslM = scaled('alt', 0.001);
        this.frame.altitudeDatum = 'REL HOME';
        if (f.relative_alt !== undefined) this.hasGlobalAltitude = true;
        if (f.hdg !== undefined && f.hdg !== 65535) this.frame.headingDeg = scaled('hdg', 0.01);
        this.frame.climbMps = scaled('vz', -0.01);
        const vx = f.vx,
          vy = f.vy;
        this.frame.groundSpeedMps = r(
          vx === undefined || vy === undefined ? undefined : Math.hypot(vx, vy) / 100,
        );
        this.frame.courseDeg = r(
          vx === undefined || vy === undefined || Math.hypot(vx, vy) < 10
            ? undefined
            : wrapHeading((Math.atan2(vy, vx) * 180) / Math.PI),
        );
        if (this.identity.depthOriginM !== undefined)
          this.frame.depthM = r(
            f.alt === undefined ? undefined : this.identity.depthOriginM - f.alt / 1000,
          );
        break;
      }
      case 'VFR_HUD':
        this.frame.airSpeedMps = r(f.airspeed, (f.airspeed ?? -1) >= 0);
        this.frame.groundSpeedMps = r(f.groundspeed, (f.groundspeed ?? -1) >= 0);
        this.frame.throttlePct = r(
          f.throttle,
          (f.throttle ?? -1) >= 0 && (f.throttle ?? 101) <= 100,
        );
        this.frame.climbMps = r(f.climb);
        // The common definition reports VFR_HUD altitude above mean sea level. A vehicle without
        // a position fix publishes no GLOBAL_POSITION_INT, so fall back to it and label the datum
        // MSL. GLOBAL_POSITION_INT keeps ownership wherever it arrives, at any point in the feed.
        if (!this.hasGlobalAltitude && f.alt !== undefined) {
          this.frame.altitudeM = r(f.alt);
          this.frame.altitudeMslM = r(f.alt);
          this.frame.altitudeDatum = 'MSL';
        }
        break;
      case 'SYS_STATUS':
        this.frame.batteryVoltageV = scaled('voltage_battery', 0.001, f.voltage_battery !== 65535);
        this.frame.batteryCurrentA = scaled('current_battery', 0.01, f.current_battery !== -1);
        this.frame.batteryPct = r(
          f.battery_remaining,
          (f.battery_remaining ?? -1) >= 0 && (f.battery_remaining ?? 101) <= 100,
        );
        if (
          [
            f.onboard_control_sensors_present,
            f.onboard_control_sensors_enabled,
            f.onboard_control_sensors_health,
          ].every((v) => v !== undefined && Number.isInteger(v))
        ) {
          const sensors: [number, string][] = [
            [1, 'GYRO'],
            [2, 'ACCEL'],
            [4, 'MAG'],
            [8, 'BARO'],
            [32, 'GPS'],
            [64, 'FLOW'],
            [256, 'RANGE'],
            [65536, 'RC'],
            [2097152, 'AHRS'],
            [4194304, 'TERRAIN'],
            [67108864, 'PROX'],
            [268435456, 'PREARM'],
            [536870912, 'AVOID'],
            [1073741824, 'PROP'],
          ];
          this.frame.sensorHealth = {
            at,
            items: sensors
              .filter(([bit]) => (f.onboard_control_sensors_present! & bit) !== 0)
              .map(([bit, label]) => ({
                id: String(bit),
                label,
                state: !(f.onboard_control_sensors_enabled! & bit)
                  ? 'disabled'
                  : f.onboard_control_sensors_health! & bit
                    ? 'ok'
                    : 'fault',
              })),
          };
        } else this.frame.sensorHealth = undefined;
        break;
      case 'DISTANCE_SENSOR': {
        const id = f.id;
        if (id === undefined || !Number.isInteger(id) || id < 0 || id > 255) return false;
        const key = String(id);
        const directions: Record<number, string> = {
          0: 'FWD',
          2: 'RIGHT',
          4: 'AFT',
          6: 'LEFT',
          24: 'UP',
          25: 'DOWN',
        };
        const technologies = ['laser', 'ultrasound', 'infrared', 'radar', 'unknown'] as const;
        const sensor = {
          id: key,
          label: `RNG ${id}`,
          direction: directions[f.orientation ?? -1] ?? `ROT ${f.orientation ?? '?'}`,
          technology: technologies[f.type ?? -1] ?? 'unknown',
          distanceM: scaled(
            'current_distance',
            0.01,
            f.min_distance !== undefined &&
              f.max_distance !== undefined &&
              f.min_distance >= 0 &&
              f.max_distance >= f.min_distance &&
              (f.current_distance ?? -1) >= f.min_distance &&
              (f.current_distance ?? Infinity) <= f.max_distance &&
              f.signal_quality !== 1,
          ),
          minM: f.min_distance === undefined ? undefined : f.min_distance / 100,
          maxM: f.max_distance === undefined ? undefined : f.max_distance / 100,
          qualityPct: r(
            f.signal_quality,
            (f.signal_quality ?? 0) > 0 && (f.signal_quality ?? 101) <= 100,
          ),
        };
        const sensors = [...(this.frame.rangefinders ?? [])];
        const index = sensors.findIndex((s) => s.id === key);
        if (index < 0) sensors.push(sensor);
        else sensors[index] = sensor;
        this.frame.rangefinders = sensors;
        break;
      }
      case 'GPS_RAW_INT':
        this.frame.gpsFix = r(f.fix_type, (f.fix_type ?? -1) >= 0 && (f.fix_type ?? 9) <= 8);
        this.frame.gpsSatellites = r(
          f.satellites_visible,
          (f.satellites_visible ?? -1) >= 0 && (f.satellites_visible ?? 255) < 255,
        );
        this.frame.gpsHdop = scaled('eph', 0.01, f.eph !== 65535);
        break;
      case 'RC_CHANNELS':
        this.frame.rcRssi = r(f.rssi, (f.rssi ?? -1) >= 0 && (f.rssi ?? 255) < 255);
        break;
      case 'RADIO_STATUS':
        this.frame.radioRssi = r(f.rssi, (f.rssi ?? -1) >= 0 && (f.rssi ?? 255) < 255);
        this.frame.radioRemoteRssi = r(
          f.remrssi,
          (f.remrssi ?? -1) >= 0 && (f.remrssi ?? 255) < 255,
        );
        break;
      case 'VIDEO_STREAM_STATUS':
        this.frame.camera = {
          ...this.frame.camera,
          at,
          mode: f.flags === undefined || !(f.flags & 1) ? undefined : f.flags & 2 ? 'IR' : 'EO',
        };
        break;
      case 'CAMERA_CAPTURE_STATUS':
        this.frame.camera = {
          ...this.frame.camera,
          recording: r(f.video_status, f.video_status === 0 || f.video_status === 1),
        };
        break;
      case 'CAMERA_THERMAL_RANGE':
        this.frame.camera = {
          ...this.frame.camera,
          minC: r(f.min, (f.min ?? Infinity) <= (f.max ?? -Infinity)),
          maxC: r(f.max, (f.min ?? Infinity) <= (f.max ?? -Infinity)),
        };
        break;
      case 'SERVO_OUTPUT_RAW':
        this.frame.outputs = this.frame.outputs?.map((output, index) => {
          const mapping = this.identity.servoOutputs![index]!;
          if (f.port !== (mapping.port ?? 0)) return output;
          const pwm = f[`servo${mapping.channel}_raw`];
          let command: number | undefined;
          if (pwm !== undefined && pwm >= mapping.pwmMin && pwm <= mapping.pwmMax) {
            const n = mapping.pwmNeutral;
            command =
              n === undefined
                ? mapping.min +
                  ((pwm - mapping.pwmMin) / (mapping.pwmMax - mapping.pwmMin)) *
                    (mapping.max - mapping.min)
                : pwm >= n
                  ? ((pwm - n) / (mapping.pwmMax - n)) * mapping.max
                  : ((n - pwm) / (n - mapping.pwmMin)) * mapping.min;
            if (mapping.reversed) command = mapping.min + mapping.max - command;
          }
          return { ...output, command: r(command) };
        });
        break;
      case 'NAV_CONTROLLER_OUTPUT':
        this.frame.targetHeadingDeg = r(
          f.nav_bearing === undefined ? undefined : wrapHeading(f.nav_bearing),
        );
        this.frame.targetBearingDeg = r(
          f.target_bearing === undefined ? undefined : wrapHeading(f.target_bearing),
        );
        this.frame.targetDistanceM = r(f.wp_dist);
        if (presetForMavType(this.frame.vehicleType ?? -1).family === 'plane') {
          const speed = readValue(this.frame.airSpeedMps, at, 0.5);
          // ArduPlane emits centimetres per second here; the common spec declares m/s.
          const error =
            f.aspd_error === undefined
              ? undefined
              : f.aspd_error * (this.autopilot === 3 ? 0.01 : 1);
          const target = speed === undefined || error === undefined ? undefined : speed + error;
          this.frame.targetAirSpeedMps = {
            ...r(target, target !== undefined && target >= 0),
            at: Math.min(at, this.frame.airSpeedMps?.at ?? at),
          };
        }
        break;
      case 'POSITION_TARGET_GLOBAL_INT':
      case 'POSITION_TARGET_LOCAL_NED': {
        const mask = f.type_mask;
        const maskValid =
          mask !== undefined && Number.isInteger(mask) && mask >= 0 && mask <= 65535;
        const global = packet.message === 'POSITION_TARGET_GLOBAL_INT';
        const datum = global
          ? (
              { 0: 'MSL', 5: 'MSL', 3: 'REL HOME', 6: 'REL HOME', 10: 'AGL', 11: 'AGL' } as Record<
                number,
                string
              >
            )[f.coordinate_frame ?? -1]
          : f.coordinate_frame === 1
            ? 'LOCAL ORIGIN'
            : undefined;
        this.frame.targetAltitudeM = scaled(
          global ? 'alt' : 'z',
          global ? 1 : -1,
          maskValid && !(mask! & 4) && !!datum,
        );
        this.frame.targetAltitudeDatum = datum;
        const velocityFrame = global ? !!datum : [1, 7, 8, 9].includes(f.coordinate_frame ?? -1);
        this.frame.targetGroundSpeedMps = r(
          f.vx === undefined || f.vy === undefined ? undefined : Math.hypot(f.vx, f.vy),
          maskValid && !(mask! & (8 | 16)) && velocityFrame,
        );
        this.frame.targetHeadingDeg = r(
          f.yaw === undefined ? undefined : wrapHeading((f.yaw * 180) / Math.PI),
          maskValid &&
            !(mask! & 1024) &&
            (global ? !!datum : [1, 7].includes(f.coordinate_frame ?? -1)),
        );
        break;
      }
      default:
        return false;
    }
    for (const key of Object.keys(this.frame) as (keyof HudFrame)[]) {
      const old = previous[key],
        next = this.frame[key];
      if (
        old &&
        next &&
        typeof old === 'object' &&
        typeof next === 'object' &&
        'at' in old &&
        'at' in next &&
        typeof old.at === 'number' &&
        typeof next.at === 'number' &&
        old.at > next.at
      )
        Object.assign(this.frame, { [key]: old });
    }
    if (this.frame.targetAltitudeM === previous.targetAltitudeM)
      this.frame.targetAltitudeDatum = previous.targetAltitudeDatum;
    if (packet.message === 'GLOBAL_POSITION_INT' || packet.message === 'VFR_HUD') {
      for (const [speedKey, accelerationKey] of [
        ['groundSpeedMps', 'groundAccelerationMps2'],
        ['airSpeedMps', 'airAccelerationMps2'],
      ] as const) {
        if (speedKey === 'airSpeedMps' && packet.message !== 'VFR_HUD') continue;
        const speed = this.frame[speedKey];
        if (!speed || speed === previous[speedKey]) continue;
        const key = `${packet.message}:${speedKey}`;
        const last = this.speedSamples.get(key);
        const dt = last ? speed.at - last.at : 0;
        this.frame[accelerationKey] = r(
          last && speed.valid !== false && last.valid !== false && dt >= 0.05 && dt <= 2
            ? (speed.value - last.value) / dt
            : undefined,
        );
        this.speedSamples.set(key, speed);
      }
    }
    this.lastMessageTime.set(messageKey, at);
    return true;
  }
  snapshot(time: number, source: HudFrame['source'] = 'live'): HudFrame {
    return structuredClone({ ...this.frame, time, source });
  }

  private statusText(packet: MavlinkEnvelope): HudAlert | undefined | false {
    const { severity, id = 0, chunk_seq: sequence = 0 } = packet.fields;
    if (
      packet.text === undefined ||
      severity === undefined ||
      !Number.isInteger(severity) ||
      severity < 0 ||
      severity > 7 ||
      !Number.isInteger(id) ||
      id < 0 ||
      id > 65535 ||
      !Number.isInteger(sequence) ||
      sequence < 0 ||
      sequence > 255
    )
      return false;
    const raw =
      typeof packet.text === 'string' ? new TextEncoder().encode(packet.text) : packet.text;
    if (raw.length > 50) return false;
    const nul = raw.indexOf(0);
    const part = [...raw.subarray(0, nul < 0 ? raw.length : nul)];
    let bytes = part;
    for (const [key, chunk] of this.statusChunks)
      if (packet.time - chunk.at > 2) this.statusChunks.delete(key);
    if (id !== 0) {
      if (sequence === 0) {
        if (this.statusChunks.size >= 16)
          this.statusChunks.delete(this.statusChunks.keys().next().value!);
        this.statusChunks.set(id, { bytes: [], next: 0, at: packet.time, severity });
      }
      const chunk = this.statusChunks.get(id);
      if (
        !chunk ||
        chunk.next !== sequence ||
        chunk.severity !== severity ||
        chunk.bytes.length + part.length > 1000
      ) {
        this.statusChunks.delete(id);
        return false;
      }
      chunk.bytes.push(...part);
      chunk.next++;
      chunk.at = packet.time;
      if (nul < 0 && raw.length === 50) return undefined;
      bytes = chunk.bytes;
      this.statusChunks.delete(id);
    } else if (sequence !== 0) return false;
    const message = Array.from(new TextDecoder().decode(new Uint8Array(bytes)), (character) => {
      const code = character.codePointAt(0)!;
      return code < 32 || code === 127 ? ' ' : character;
    })
      .join('')
      .trim();
    if (!message) return false;
    return {
      id: `mavlink-${++this.alertSequence}`,
      at: packet.time,
      source: 'MAVLINK',
      message,
      severity:
        severity === 0
          ? 'emergency'
          : severity <= 3
            ? 'critical'
            : severity === 4
              ? 'warning'
              : 'info',
    };
  }
}
