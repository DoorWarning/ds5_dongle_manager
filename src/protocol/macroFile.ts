// Text form of one macro slot, for copy/paste and .json files. Readable and
// editable by hand: one step per line, button names, sticks in percent.
//
// {
//   "type": "ds5dongle-macro",
//   "version": 1,
//   "steps": [
//     { "ms": 120, "buttons": ["circle"] },
//     { "ms": 300, "left": [0, 100] },
//     { "ms": 80 }
//   ]
// }
//
// "buttons" lists SWITCH_BUTTONS keys; "left"/"right" are [x, y] in -100..100
// (up and right positive); both may be left out (released / centred).
import { STICK_CENTER, SWITCH_BUTTONS, type MacroEvent, type SwitchButtonKey } from "./nsSettings";

export const MACRO_FILE_TYPE = "ds5dongle-macro";
const MACRO_FILE_VERSION = 1;
const MAX_STEP_MS = 60000;

export class MacroFileError extends Error {
  readonly code: "json" | "format" | "tooMany" | "step";
  readonly detail: Record<string, unknown>;

  constructor(code: MacroFileError["code"], detail: Record<string, unknown> = {}) {
    super(code);
    this.code = code;
    this.detail = detail;
    this.name = "MacroFileError";
  }
}

const BUTTON_KEYS = new Set<string>(SWITCH_BUTTONS.map((button) => button.key));

function stickToPercent(raw: number): number {
  return Math.round(((raw - STICK_CENTER) / 2047) * 100);
}

function percentToStick(pct: number): number {
  return Math.round(STICK_CENTER + (Math.min(100, Math.max(-100, pct)) / 100) * 2047);
}

export function serializeMacro(events: MacroEvent[]): string {
  const lines = events.map((event) => {
    const step: Record<string, unknown> = { ms: event.durMs };
    const buttons = SWITCH_BUTTONS.filter((button) => (event.buttons[button.byte] & button.bit) !== 0).map((button) => button.key);
    if (buttons.length > 0) {
      step.buttons = buttons;
    }
    for (const side of ["left", "right"] as const) {
      const x = stickToPercent(event[side].x);
      const y = stickToPercent(event[side].y);
      if (x !== 0 || y !== 0) {
        step[side] = [x, y];
      }
    }
    return `    ${JSON.stringify(step)}`;
  });
  return [
    "{",
    `  "type": "${MACRO_FILE_TYPE}",`,
    `  "version": ${MACRO_FILE_VERSION},`,
    lines.length > 0 ? `  "steps": [\n${lines.join(",\n")}\n  ]` : `  "steps": []`,
    "}",
    "",
  ].join("\n");
}

/** Accepts the full document or just the steps array. Throws MacroFileError. */
export function parseMacro(text: string, maxSteps: number): MacroEvent[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (cause) {
    throw new MacroFileError("json", { message: cause instanceof Error ? cause.message : String(cause) });
  }

  const steps = Array.isArray(data) ? data : (data as { steps?: unknown })?.steps;
  if (!Array.isArray(steps)) {
    throw new MacroFileError("format");
  }
  if (steps.length > maxSteps) {
    throw new MacroFileError("tooMany", { count: steps.length, max: maxSteps });
  }

  return steps.map((raw, index) => parseStep(raw, index + 1));
}

function parseStep(raw: unknown, step: number): MacroEvent {
  const fail = (reason: string): never => {
    throw new MacroFileError("step", { step, reason });
  };
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    fail("not an object");
  }
  const value = raw as Record<string, unknown>;

  const ms = value.ms;
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 1 || ms > MAX_STEP_MS) {
    fail(`"ms" must be 1-${MAX_STEP_MS}`);
  }

  const buttons: [number, number, number] = [0, 0, 0];
  if (value.buttons !== undefined) {
    if (!Array.isArray(value.buttons)) {
      fail('"buttons" must be a list');
    }
    for (const name of value.buttons as unknown[]) {
      if (typeof name !== "string" || !BUTTON_KEYS.has(name)) {
        fail(`unknown button "${String(name)}"`);
      }
      const button = SWITCH_BUTTONS.find((item) => item.key === (name as SwitchButtonKey))!;
      buttons[button.byte] |= button.bit;
    }
  }

  const stick = (side: "left" | "right") => {
    const pair = value[side];
    if (pair === undefined) {
      return { x: STICK_CENTER, y: STICK_CENTER };
    }
    if (!Array.isArray(pair) || pair.length !== 2 || pair.some((n) => typeof n !== "number" || !Number.isFinite(n) || n < -100 || n > 100)) {
      fail(`"${side}" must be [x, y] with -100..100`);
    }
    const [x, y] = pair as number[];
    return { x: percentToStick(x), y: percentToStick(y) };
  };

  return { durMs: Math.round(ms as number), buttons, left: stick("left"), right: stick("right") };
}
