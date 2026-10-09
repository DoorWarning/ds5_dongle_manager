// Companion protocol (ds5_dongle src/companion.cpp).
// Request [cmd, seq, len, payload...], reply [cmd, seq, status, len, data...].
// PC mode carries it in Feature report 0xFA, NS mode in Pro Controller subcommand 0xE0;
// the Rust side (ds5_companion_exchange) picks the transport from the device path.
import { invoke } from "@tauri-apps/api/core";

export enum CompanionCommand {
  GetInfo = 0x01,
  SetMode = 0x02,
}

export enum CompanionStatus {
  Ok = 0,
  UnknownCommand = 1,
  BadArgs = 2,
}

/** Firmware controller_mode values (config.h ControllerMode). */
export enum DongleControllerMode {
  DS5 = 0,
  DSE = 1,
  Auto = 2,
  SwitchPro = 3,
}

export interface DongleInfo {
  protocol: number;
  storedMode: DongleControllerMode;
  activeMode: DongleControllerMode;
  ds5Connected: boolean;
  wakeBeaconLearned: boolean;
  serialBuild: boolean;
  /** 0-100 %, or null when no DualSense is connected. */
  batteryPercent: number | null;
  charging: boolean;
  firmware: string;
}

export class CompanionError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "CompanionError";
  }
}

const MAX_PAYLOAD = 56;
const ATTEMPTS = 3;

export class CompanionClient {
  private seq = 0;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly path: string) {}

  /** Requests are serialized: the firmware keeps one reply at a time. */
  request(cmd: CompanionCommand, payload: ArrayLike<number> = [], timeoutMs = 600): Promise<Uint8Array> {
    const run = async () => {
      if (payload.length > MAX_PAYLOAD) {
        throw new CompanionError("payload too large");
      }
      const seq = (this.seq = (this.seq + 1) & 0xff);
      const packet = [cmd, seq, payload.length, ...Array.from(payload)];

      let lastError: unknown;
      for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
        try {
          const reply = new Uint8Array(
            await invoke<number[]>("ds5_companion_exchange", { path: this.path, request: packet, timeoutMs }),
          );
          if (reply.length < 4 || reply[0] !== cmd || reply[1] !== seq) {
            lastError = new CompanionError("unexpected reply");
            continue;
          }
          if (reply[2] !== CompanionStatus.Ok) {
            throw new CompanionError(`status ${reply[2]}`, reply[2]);
          }
          return reply.slice(4, 4 + reply[3]);
        } catch (error) {
          if (error instanceof CompanionError && error.status !== undefined) {
            throw error;
          }
          lastError = error;
        }
      }
      throw lastError instanceof Error ? lastError : new CompanionError(String(lastError ?? "no reply"));
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  async getInfo(): Promise<DongleInfo> {
    const data = await this.request(CompanionCommand.GetInfo);
    if (data.length < 5) {
      throw new CompanionError("short info reply");
    }
    const battery = data[4];
    return {
      protocol: data[0],
      storedMode: data[1] as DongleControllerMode,
      activeMode: data[2] as DongleControllerMode,
      ds5Connected: (data[3] & 0x01) !== 0,
      wakeBeaconLearned: (data[3] & 0x02) !== 0,
      serialBuild: (data[3] & 0x04) !== 0,
      // DualSense status nibbles: low = level 0-10, high = 0 discharging / 1 charging / 2 full.
      batteryPercent: battery === 0xff ? null : battery >> 4 === 2 ? 100 : Math.min(100, (battery & 0x0f) * 10 + 5),
      charging: battery !== 0xff && battery >> 4 === 1,
      firmware: new TextDecoder().decode(data.subarray(5)).replace(/\0+$/, ""),
    };
  }

  /** The dongle saves the mode and reboots shortly after replying. */
  async setMode(mode: DongleControllerMode): Promise<void> {
    await this.request(CompanionCommand.SetMode, [mode]);
  }
}
