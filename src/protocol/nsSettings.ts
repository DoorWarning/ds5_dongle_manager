// NS (Switch Pro) mode settings and macros, as the firmware stores them
// (ds5_dongle src/switch_settings.h NsSettings, src/macro.cpp MacroEvent).
import {
  COMPANION_CHUNK,
  CompanionClient,
  CompanionCommand,
  type CompanionRequest,
} from "./companion";

export const NS_TRIGGER_SLOTS = 4;
export const NS_FFB_SIZE = 11;
export const TURBO_RATE_MIN = 2;
export const TURBO_RATE_MAX = 30;
export const MACRO_SLOTS = 4;
export const MACRO_EVENT_SIZE = 12;
export const STICK_CENTER = 2048;
const NS_SETTINGS_SIZE = 4 + NS_TRIGGER_SLOTS * (2 * NS_FFB_SIZE + 2);

export type TriggerSide = 0 | 1; // 0 = L2, 1 = R2

export interface NsTriggerSlot {
  /** Raw DualSense adaptive trigger effect per side: [L2, R2], 11 bytes each. */
  effect: [number[], number[]];
  /** Analog value where ZL/ZR fire; 0 = digital bit or analog > 32. */
  threshold: [number, number];
}

export interface NsSettings {
  vibPercent: number;
  triggerMode: number; // 1-4
  turboMask: number;
  turboRate: number;
  slots: NsTriggerSlot[];
}

// Turbo bits, same order as the firmware's TurboBit.
export const TURBO_BUTTONS = [
  { bit: 0x01, key: "circle" },
  { bit: 0x02, key: "cross" },
  { bit: 0x04, key: "triangle" },
  { bit: 0x08, key: "square" },
  { bit: 0x10, key: "l1" },
  { bit: 0x20, key: "r1" },
  { bit: 0x40, key: "l2" },
  { bit: 0x80, key: "r2" },
] as const;

export function decodeNsSettings(bytes: Uint8Array): NsSettings {
  if (bytes.length < NS_SETTINGS_SIZE) {
    throw new Error(`NS settings: ${bytes.length} bytes, expected ${NS_SETTINGS_SIZE}`);
  }
  const slots: NsTriggerSlot[] = [];
  for (let i = 0; i < NS_TRIGGER_SLOTS; i += 1) {
    const base = 4 + i * (2 * NS_FFB_SIZE + 2);
    slots.push({
      effect: [
        Array.from(bytes.subarray(base, base + NS_FFB_SIZE)),
        Array.from(bytes.subarray(base + NS_FFB_SIZE, base + 2 * NS_FFB_SIZE)),
      ],
      threshold: [bytes[base + 2 * NS_FFB_SIZE], bytes[base + 2 * NS_FFB_SIZE + 1]],
    });
  }
  return { vibPercent: bytes[0], triggerMode: bytes[1], turboMask: bytes[2], turboRate: bytes[3], slots };
}

export function encodeNsSettings(settings: NsSettings): Uint8Array {
  const bytes = new Uint8Array(NS_SETTINGS_SIZE);
  bytes[0] = clampByte(settings.vibPercent, 0, 100);
  bytes[1] = clampByte(settings.triggerMode, 1, NS_TRIGGER_SLOTS);
  bytes[2] = settings.turboMask & 0xff;
  bytes[3] = clampByte(settings.turboRate, TURBO_RATE_MIN, TURBO_RATE_MAX);
  settings.slots.forEach((slot, i) => {
    const base = 4 + i * (2 * NS_FFB_SIZE + 2);
    for (const side of [0, 1] as const) {
      slot.effect[side].slice(0, NS_FFB_SIZE).forEach((value, j) => {
        bytes[base + side * NS_FFB_SIZE + j] = clampByte(value, 0, 255);
      });
      bytes[base + 2 * NS_FFB_SIZE + side] = clampByte(slot.threshold[side], 0, 255);
    }
  });
  return bytes;
}

export function nsSettingsEqual(left: NsSettings | null, right: NsSettings | null): boolean {
  if (!left || !right) {
    return left === right;
  }
  const a = encodeNsSettings(left);
  const b = encodeNsSettings(right);
  return a.every((value, index) => value === b[index]);
}

export async function readNsSettings(client: CompanionClient): Promise<NsSettings> {
  const first = await client.request(CompanionCommand.NsSettingsRead, [0]);
  const total = first[0];
  const bytes = new Uint8Array(total);
  bytes.set(first.subarray(1), 0);
  const requests: CompanionRequest[] = [];
  for (let offset = COMPANION_CHUNK; offset < total; offset += COMPANION_CHUNK) {
    requests.push({ cmd: CompanionCommand.NsSettingsRead, payload: [offset] });
  }
  const replies = requests.length > 0 ? await client.batch(requests) : [];
  replies.forEach((reply, index) => bytes.set(reply.subarray(1), (index + 1) * COMPANION_CHUNK));
  return decodeNsSettings(bytes);
}

/** Writes the whole block and applies it; the dongle saves it to flash a few seconds later. */
export async function writeNsSettings(client: CompanionClient, settings: NsSettings): Promise<void> {
  const bytes = encodeNsSettings(settings);
  const requests: CompanionRequest[] = [];
  for (let offset = 0; offset < bytes.length; offset += COMPANION_CHUNK) {
    requests.push({
      cmd: CompanionCommand.NsSettingsWrite,
      payload: [offset, ...bytes.subarray(offset, offset + COMPANION_CHUNK)],
    });
  }
  requests.push({ cmd: CompanionCommand.NsSettingsApply });
  await client.batch(requests);
}

// --- Macros -----------------------------------------------------------------

/**
 * One macro step. buttons = Switch report bytes 2..4 (see SWITCH_BUTTONS),
 * sticks = 12-bit x/y, 0-4095, centre 2048, y up = larger.
 */
export interface MacroEvent {
  durMs: number;
  buttons: [number, number, number];
  left: { x: number; y: number };
  right: { x: number; y: number };
}

export type MacroStatus = "idle" | "recording" | "playing";

export interface MacroInfo {
  status: MacroStatus;
  activeSlot: number | null;
  maxEvents: number;
  counts: number[];
}

/** Switch report button bits, labelled with the DualSense button that produces them. */
export const SWITCH_BUTTONS = [
  { byte: 0, bit: 0x08, key: "circle" },
  { byte: 0, bit: 0x04, key: "cross" },
  { byte: 0, bit: 0x02, key: "triangle" },
  { byte: 0, bit: 0x01, key: "square" },
  { byte: 2, bit: 0x02, key: "up" },
  { byte: 2, bit: 0x01, key: "down" },
  { byte: 2, bit: 0x08, key: "left" },
  { byte: 2, bit: 0x04, key: "right" },
  { byte: 2, bit: 0x40, key: "l1" },
  { byte: 0, bit: 0x40, key: "r1" },
  { byte: 2, bit: 0x80, key: "l2" },
  { byte: 0, bit: 0x80, key: "r2" },
  { byte: 1, bit: 0x08, key: "l3" },
  { byte: 1, bit: 0x04, key: "r3" },
  { byte: 1, bit: 0x01, key: "create" },
  { byte: 1, bit: 0x02, key: "options" },
  { byte: 1, bit: 0x10, key: "ps" },
  { byte: 1, bit: 0x20, key: "touchpad" },
] as const;

export type SwitchButtonKey = (typeof SWITCH_BUTTONS)[number]["key"];

export function decodeMacroEvents(bytes: Uint8Array): MacroEvent[] {
  const events: MacroEvent[] = [];
  for (let offset = 0; offset + MACRO_EVENT_SIZE <= bytes.length; offset += MACRO_EVENT_SIZE) {
    const e = bytes.subarray(offset, offset + MACRO_EVENT_SIZE);
    events.push({
      durMs: e[0] | (e[1] << 8),
      buttons: [e[2], e[3], e[4]],
      left: decodeStick(e.subarray(5, 8)),
      right: decodeStick(e.subarray(8, 11)),
    });
  }
  return events;
}

export function encodeMacroEvents(events: MacroEvent[]): Uint8Array {
  const bytes = new Uint8Array(events.length * MACRO_EVENT_SIZE);
  events.forEach((event, index) => {
    const offset = index * MACRO_EVENT_SIZE;
    const dur = clamp(Math.round(event.durMs), 1, 60000);
    bytes[offset] = dur & 0xff;
    bytes[offset + 1] = dur >> 8;
    bytes.set(event.buttons.map((value) => value & 0xff), offset + 2);
    bytes.set(encodeStick(event.left), offset + 5);
    bytes.set(encodeStick(event.right), offset + 8);
  });
  return bytes;
}

export function neutralMacroEvent(durMs = 100): MacroEvent {
  return {
    durMs,
    buttons: [0, 0, 0],
    left: { x: STICK_CENTER, y: STICK_CENTER },
    right: { x: STICK_CENTER, y: STICK_CENTER },
  };
}

export async function readMacroInfo(client: CompanionClient): Promise<MacroInfo> {
  const data = await client.request(CompanionCommand.MacroInfo);
  const counts: number[] = [];
  for (let i = 0; i < MACRO_SLOTS; i += 1) {
    counts.push(data[4 + i * 2] | (data[5 + i * 2] << 8));
  }
  const status: MacroStatus = data[0] === 1 ? "recording" : data[0] === 2 ? "playing" : "idle";
  return {
    status,
    activeSlot: data[1] < MACRO_SLOTS ? data[1] : null,
    maxEvents: data[2] | (data[3] << 8),
    counts,
  };
}

export async function readMacro(client: CompanionClient, slot: number, count: number): Promise<MacroEvent[]> {
  const total = count * MACRO_EVENT_SIZE;
  const requests: CompanionRequest[] = [];
  for (let offset = 0; offset < total; offset += COMPANION_CHUNK) {
    requests.push({ cmd: CompanionCommand.MacroRead, payload: [slot, offset & 0xff, offset >> 8] });
  }
  const replies = requests.length > 0 ? await client.batch(requests) : [];
  const bytes = new Uint8Array(total);
  replies.forEach((reply, index) => bytes.set(reply.subarray(0, total - index * COMPANION_CHUNK), index * COMPANION_CHUNK));
  return decodeMacroEvents(bytes);
}

/** Replaces the slot; an empty list clears it. */
export async function writeMacro(client: CompanionClient, slot: number, events: MacroEvent[]): Promise<void> {
  const bytes = encodeMacroEvents(events);
  const requests: CompanionRequest[] = [{ cmd: CompanionCommand.MacroEditBegin, payload: [slot] }];
  for (let offset = 0; offset < bytes.length; offset += COMPANION_CHUNK) {
    requests.push({
      cmd: CompanionCommand.MacroEditWrite,
      payload: [offset & 0xff, offset >> 8, ...bytes.subarray(offset, offset + COMPANION_CHUNK)],
    });
  }
  requests.push({ cmd: CompanionCommand.MacroEditCommit, payload: [events.length & 0xff, events.length >> 8] });
  await client.batch(requests);
}

function decodeStick(p: Uint8Array): { x: number; y: number } {
  return { x: p[0] | ((p[1] & 0x0f) << 8), y: (p[1] >> 4) | (p[2] << 4) };
}

function encodeStick(stick: { x: number; y: number }): number[] {
  const x = clamp(Math.round(stick.x), 0, 4095);
  const y = clamp(Math.round(stick.y), 0, 4095);
  return [x & 0xff, ((x >> 8) & 0x0f) | ((y & 0x0f) << 4), y >> 4];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function clampByte(value: number, min: number, max: number): number {
  return clamp(Math.round(value), min, max);
}
