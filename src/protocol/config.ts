// Mirrors Config_body in ds5_dongle/src/config.h (packed, little-endian).
// Field order and ranges follow ds5_dongle/tools/config_tool.py FIELDS and config_valid().
export const CONFIG_BODY_SIZE = 23;
export const FEATURE_REPORT_PAYLOAD_SIZE = 63;
export const CONFIG_VERSION = 5;
export const STATUS_GPIO_DISABLED = 255;

export type PollingRateMode = 0 | 1 | 2;
export type ControllerMode = 0 | 1 | 2 | 3;
export type AudioSelect = 0 | 1 | 2 | 3;
export type StatusGpioMode = 0 | 1;

export interface ConfigBody {
  configVersion: number;
  hapticsGain: number;
  speakerVolume: number;
  headsetVolume: number;
  speakerGain: number;
  inactiveTime: number;
  disablePicoLed: boolean;
  pollingRateMode: PollingRateMode;
  audioBufferLength: number;
  controllerMode: ControllerMode;
  enableUsbSn: boolean;
  psShortcutEnabled: boolean;
  micSelect: AudioSelect;
  speakerSelect: AudioSelect;
  enableWake: boolean;
  triggerReduce: number;
  lockVolume: boolean;
  statusGpioPin: number;
  statusGpioMode: StatusGpioMode;
}

export interface ConfigValidationIssue {
  field: keyof ConfigBody;
}

// Values config_valid() falls back to after a reset (body memset to 0xFF).
export const DEFAULT_CONFIG: ConfigBody = {
  configVersion: CONFIG_VERSION,
  hapticsGain: 1,
  speakerVolume: 100,
  headsetVolume: 100,
  speakerGain: 2,
  inactiveTime: 30,
  disablePicoLed: false,
  pollingRateMode: 1,
  audioBufferLength: 48,
  controllerMode: 2,
  enableUsbSn: false,
  psShortcutEnabled: false,
  micSelect: 0,
  speakerSelect: 0,
  enableWake: false,
  triggerReduce: 0,
  lockVolume: false,
  statusGpioPin: STATUS_GPIO_DISABLED,
  statusGpioMode: 0,
};

export const POLLING_RATE_OPTIONS: Array<{ value: PollingRateMode; label: string }> = [
  { value: 0, label: "250 Hz" },
  { value: 1, label: "500 Hz" },
  { value: 2, label: "Real-time" },
];

// Mode 3 (Switch Pro) is switched through the companion SET_MODE command, not here.
export const CONTROLLER_MODE_OPTIONS: Array<{ value: ControllerMode }> = [
  { value: 0 },
  { value: 1 },
  { value: 2 },
];

export const AUDIO_SELECT_OPTIONS: AudioSelect[] = [0, 1, 2, 3];

// GPIOs the Pico 2 W leaves free (0/1 UART, 23-25 CYW43, 29 VSYS are reserved).
export const STATUS_GPIO_PINS: number[] = [
  2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 26, 27, 28,
];

export function decodeConfigBody(source: ArrayBuffer | DataView | Uint8Array): ConfigBody {
  const bytes = toUint8Array(source);
  const candidates = configBodyOffsets(bytes);
  const parsed = candidates.map((offset) => {
    const config = decodeAt(bytes, offset);
    return { offset, config, issues: validateConfig(config) };
  });
  const valid = parsed.find((candidate) => candidate.issues.length === 0);

  if (valid) {
    return valid.config;
  }

  if (parsed[0]) {
    throw new ConfigDecodeError("invalidConfig", {
      issues: parsed[0].issues.map((issue) => issue.field),
      offset: parsed[0].offset,
      rawHex: bytesToHex(bytes),
    });
  }

  throw new ConfigDecodeError("invalidBytes", {
    count: bytes.byteLength,
    expected: CONFIG_BODY_SIZE,
  });
}

export function encodeConfigBody(config: ConfigBody): Uint8Array<ArrayBuffer> {
  const issues = validateConfig(config);
  if (issues.length > 0) {
    throw new ConfigDecodeError("invalidConfig", {
      issues: issues.map((issue) => issue.field),
    });
  }

  const bytes = new Uint8Array(new ArrayBuffer(CONFIG_BODY_SIZE));
  const view = new DataView(bytes.buffer);
  view.setUint8(0, config.configVersion);
  view.setFloat32(1, config.hapticsGain, true);
  view.setUint8(5, config.speakerVolume);
  view.setUint8(6, config.headsetVolume);
  view.setUint8(7, config.speakerGain);
  view.setUint8(8, config.inactiveTime);
  view.setUint8(9, config.disablePicoLed ? 1 : 0);
  view.setUint8(10, config.pollingRateMode);
  view.setUint8(11, config.audioBufferLength);
  view.setUint8(12, config.controllerMode);
  view.setUint8(13, config.enableUsbSn ? 1 : 0);
  view.setUint8(14, config.psShortcutEnabled ? 1 : 0);
  view.setUint8(15, config.micSelect);
  view.setUint8(16, config.speakerSelect);
  view.setUint8(17, config.enableWake ? 1 : 0);
  view.setUint8(18, config.triggerReduce);
  view.setUint8(19, config.lockVolume ? 1 : 0);
  view.setUint8(20, config.statusGpioPin);
  view.setUint8(21, config.statusGpioMode);
  return bytes;
}

export function validateConfig(config: ConfigBody): ConfigValidationIssue[] {
  const issues: ConfigValidationIssue[] = [];
  const check = (field: keyof ConfigBody, ok: boolean) => {
    if (!ok) {
      issues.push({ field });
    }
  };
  const intIn = (value: number, min: number, max: number) => Number.isInteger(value) && value >= min && value <= max;

  check("configVersion", config.configVersion === CONFIG_VERSION);
  check("hapticsGain", Number.isFinite(config.hapticsGain) && config.hapticsGain >= 1 && config.hapticsGain <= 2);
  check("speakerVolume", intIn(config.speakerVolume, 0, 127));
  check("headsetVolume", intIn(config.headsetVolume, 0, 127));
  check("speakerGain", intIn(config.speakerGain, 0, 7));
  check("inactiveTime", intIn(config.inactiveTime, 0, 60));
  check("pollingRateMode", intIn(config.pollingRateMode, 0, 2));
  check("audioBufferLength", intIn(config.audioBufferLength, 16, 128));
  check("controllerMode", intIn(config.controllerMode, 0, 3));
  check("micSelect", intIn(config.micSelect, 0, 3));
  check("speakerSelect", intIn(config.speakerSelect, 0, 3));
  check("triggerReduce", intIn(config.triggerReduce, 0, 10));
  check(
    "statusGpioPin",
    config.statusGpioPin === STATUS_GPIO_DISABLED || STATUS_GPIO_PINS.includes(config.statusGpioPin),
  );
  check("statusGpioMode", intIn(config.statusGpioMode, 0, 1));

  return issues;
}

export function normalizeConfig(config: ConfigBody): ConfigBody {
  return {
    configVersion: CONFIG_VERSION,
    hapticsGain: clampToStep(config.hapticsGain, 1, 2, 0.01),
    speakerVolume: clampInteger(config.speakerVolume, 0, 127),
    headsetVolume: clampInteger(config.headsetVolume, 0, 127),
    speakerGain: clampInteger(config.speakerGain, 0, 7),
    inactiveTime: clampInteger(config.inactiveTime, 0, 60),
    disablePicoLed: Boolean(config.disablePicoLed),
    pollingRateMode: clampInteger(config.pollingRateMode, 0, 2) as PollingRateMode,
    audioBufferLength: clampInteger(config.audioBufferLength, 16, 128),
    controllerMode: clampInteger(config.controllerMode, 0, 3) as ControllerMode,
    enableUsbSn: Boolean(config.enableUsbSn),
    psShortcutEnabled: Boolean(config.psShortcutEnabled),
    micSelect: clampInteger(config.micSelect, 0, 3) as AudioSelect,
    speakerSelect: clampInteger(config.speakerSelect, 0, 3) as AudioSelect,
    enableWake: Boolean(config.enableWake),
    triggerReduce: clampInteger(config.triggerReduce, 0, 10),
    lockVolume: Boolean(config.lockVolume),
    statusGpioPin: STATUS_GPIO_PINS.includes(config.statusGpioPin) ? config.statusGpioPin : STATUS_GPIO_DISABLED,
    statusGpioMode: clampInteger(config.statusGpioMode, 0, 1) as StatusGpioMode,
  };
}

export function configsEqual(left: ConfigBody | null, right: ConfigBody | null): boolean {
  if (!left || !right) {
    return left === right;
  }

  return (Object.keys(left) as Array<keyof ConfigBody>).every((key) =>
    key === "hapticsGain" ? Math.abs(left.hapticsGain - right.hapticsGain) < 0.001 : left[key] === right[key],
  );
}

export function fieldIssue(
  issues: ConfigValidationIssue[],
  field: keyof ConfigBody,
): ConfigValidationIssue | undefined {
  return issues.find((issue) => issue.field === field);
}

export class ConfigDecodeError extends Error {
  constructor(
    public readonly code: "invalidConfig" | "invalidBytes",
    public readonly values: Record<string, unknown>,
  ) {
    super(code);
    this.name = "ConfigDecodeError";
  }
}

function decodeAt(bytes: Uint8Array, offset: number): ConfigBody {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, CONFIG_BODY_SIZE);
  return {
    configVersion: view.getUint8(0),
    hapticsGain: view.getFloat32(1, true),
    speakerVolume: view.getUint8(5),
    headsetVolume: view.getUint8(6),
    speakerGain: view.getUint8(7),
    inactiveTime: view.getUint8(8),
    disablePicoLed: view.getUint8(9) === 1,
    pollingRateMode: view.getUint8(10) as PollingRateMode,
    audioBufferLength: view.getUint8(11),
    controllerMode: view.getUint8(12) as ControllerMode,
    enableUsbSn: view.getUint8(13) === 1,
    psShortcutEnabled: view.getUint8(14) === 1,
    micSelect: view.getUint8(15) as AudioSelect,
    speakerSelect: view.getUint8(16) as AudioSelect,
    enableWake: view.getUint8(17) === 1,
    triggerReduce: view.getUint8(18),
    lockVolume: view.getUint8(19) === 1,
    statusGpioPin: view.getUint8(20),
    statusGpioMode: view.getUint8(21) as StatusGpioMode,
  };
}

// hidapi returns the report id first; tolerate payloads with or without it.
function configBodyOffsets(bytes: Uint8Array): number[] {
  const offsets: number[] = [];
  if (bytes.byteLength >= CONFIG_BODY_SIZE + 1 && bytes[0] === 0xf7) {
    offsets.push(1);
  }
  if (bytes.byteLength >= CONFIG_BODY_SIZE) {
    offsets.push(0);
  }
  if (bytes.byteLength >= CONFIG_BODY_SIZE + 1 && !offsets.includes(1)) {
    offsets.push(1);
  }
  return offsets;
}

function toUint8Array(source: ArrayBuffer | DataView | Uint8Array): Uint8Array {
  if (source instanceof Uint8Array) {
    return source;
  }

  if (source instanceof DataView) {
    return new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
  }

  return new Uint8Array(source);
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function clampToStep(value: number, min: number, max: number, step: number): number {
  return Math.min(max, Math.max(min, Math.round(value / step) * step));
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
}
