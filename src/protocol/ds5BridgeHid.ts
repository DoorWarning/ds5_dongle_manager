import { invoke } from "@tauri-apps/api/core";
import {
  ConfigBody,
  ConfigDecodeError,
  FEATURE_REPORT_PAYLOAD_SIZE,
  decodeConfigBody,
  encodeConfigBody,
} from "./config";
import { CompanionClient } from "./companion";

export const SONY_VENDOR_ID = 0x054c;
export const DUALSENSE_PRODUCT_ID = 0x0ce6;
export const DUALSENSE_EDGE_PRODUCT_ID = 0x0df2;
export const NINTENDO_VENDOR_ID = 0x057e;
export const SWITCH_PRO_PRODUCT_ID = 0x2009;
export const SUPPORTED_PRODUCT_IDS = [DUALSENSE_PRODUCT_ID, DUALSENSE_EDGE_PRODUCT_ID] as const;
export const NO_DEVICE_SELECTED_ERROR = "noDeviceSelected";
export const WEBHID_UNAVAILABLE_ERROR = "webHidUnavailable";

const REPORT_SET_CONFIG = 0xf6;
const REPORT_GET_CONFIG = 0xf7;
const REPORT_GET_FIRMWARE_VERSION = 0xf8;
const REPORT_GET_SIGNAL_STRENGTH = 0xf9;
const REPORT_COMMAND = 0x80;
const REPORT_RESULT = 0x81;
const CMD_UPDATE_CONFIG = 0x01;
const CMD_SAVE_TO_FLASH = 0x02;
const CMD_RECONNECT_USB = 0x03;
const DEVICE_SYSTEM = 0x01;
const ACTION_READ_SERIAL_NUMBER = 0x13;
const SERIAL_NUMBER_SIZE = 32;
const AUDIO_FLAGS_VALID = 0x80;
const deviceSessionKeyByPath = new Map<string, string>();
let nextDeviceSessionId = 1;

export interface TauriHidDeviceInfo {
  path: string;
  vendorId: number;
  productId: number;
  serialNumber?: string | null;
  manufacturerString?: string | null;
  productName?: string | null;
  releaseNumber?: number;
  interfaceNumber?: number;
  usagePage?: number;
  usage?: number;
}

export interface PicoBridgeStatus {
  signalStrength: number | null;
  /** null when the firmware does not report audio gating. */
  micActive: boolean | null;
  speakerActive: boolean | null;
}

class TauriHidDevice extends EventTarget {
  opened = false;
  readonly vendorId: number;
  readonly productId: number;
  readonly productName: string;
  readonly serialNumber?: string;
  readonly collections: HIDCollectionInfo[] = [];

  constructor(readonly info: TauriHidDeviceInfo) {
    super();
    this.vendorId = info.vendorId;
    this.productId = info.productId;
    this.productName = info.productName || "DS5 Dongle";
    this.serialNumber = info.serialNumber || undefined;
  }

  async open(): Promise<void> {
    this.opened = true;
  }

  async close(): Promise<void> {
    this.opened = false;
  }

  async sendFeatureReport(reportId: number, data: BufferSource): Promise<void> {
    const bytes = data instanceof DataView
      ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      : data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    await invoke("ds5_send_feature_report", { path: this.info.path, reportId, data: Array.from(bytes) });
  }

  async receiveFeatureReport(reportId: number, length = FEATURE_REPORT_PAYLOAD_SIZE + 1): Promise<DataView> {
    const bytes = await invoke<number[]>("ds5_read_feature_report", {
      path: this.info.path,
      reportId,
      length,
    });
    return bytesToDataView(bytes);
  }

  async readInputReport(timeoutMs: number, length = 64): Promise<DataView | null> {
    const bytes = await invoke<number[] | null>("ds5_read_input_report", {
      path: this.info.path,
      timeoutMs,
      length,
    });
    return bytes ? bytesToDataView(bytes) : null;
  }
}

export class Ds5BridgeHidClient {
  private readonly tauriDevice: TauriHidDevice;
  readonly companion: CompanionClient;

  constructor(public readonly device: HIDDevice) {
    this.tauriDevice = device as unknown as TauriHidDevice;
    this.companion = new CompanionClient(this.tauriDevice.info.path);
  }

  /** NS mode: the dongle enumerates as a Pro Controller and only speaks the companion protocol. */
  get isSwitchMode(): boolean {
    return isSwitchProDevice(this.device);
  }

  static isSupportedDevice(device: HIDDevice): boolean {
    return isDualSenseDevice(device) || isSwitchProDevice(device);
  }

  static async requestDevice(): Promise<Ds5BridgeHidClient> {
    const devices = await Ds5BridgeHidClient.authorizedDevices();
    const device = devices.find(isAutoConnectCandidate);
    if (!device) {
      throw new Error(NO_DEVICE_SELECTED_ERROR);
    }

    return new Ds5BridgeHidClient(device);
  }

  static async authorizedDevices(): Promise<HIDDevice[]> {
    const devices = await invoke<TauriHidDeviceInfo[]>("ds5_list_devices");
    return tauriDeviceInfosToHidDevices(devices).filter((device) => Ds5BridgeHidClient.isSupportedDevice(device));
  }

  static devicePath(device: HIDDevice): string | null {
    return (device as unknown as TauriHidDevice).info?.path ?? null;
  }

  async open(): Promise<void> {
    if (!this.tauriDevice.opened) {
      await this.tauriDevice.open();
    }
  }

  async close(): Promise<void> {
    if (this.tauriDevice.opened) {
      await this.tauriDevice.close();
    }
  }

  async readConfig(): Promise<ConfigBody> {
    await this.open();
    const report = await this.tauriDevice.receiveFeatureReport(REPORT_GET_CONFIG);
    debugFeatureReport("readConfig receive", REPORT_GET_CONFIG, report);
    try {
      return decodeConfigBody(report);
    } catch (cause) {
      if (cause instanceof ConfigDecodeError && import.meta.env.DEV) {
        console.warn("[DS5 Dongle HID] readConfig decode failed", cause.values);
      }
      throw cause;
    }
  }

  async applyConfig(config: ConfigBody): Promise<void> {
    await this.open();
    const report = commandReport(CMD_UPDATE_CONFIG);
    report.set(encodeConfigBody(config), 1);
    await this.tauriDevice.sendFeatureReport(REPORT_SET_CONFIG, report);
  }

  async readFirmwareVersion(): Promise<string> {
    await this.open();
    const report = await this.tauriDevice.receiveFeatureReport(REPORT_GET_FIRMWARE_VERSION);
    return sanitizeFirmwareVersion(decodeNullTerminatedText(featureReportPayload(report, REPORT_GET_FIRMWARE_VERSION)));
  }

  async readPicoBridgeStatus(): Promise<PicoBridgeStatus> {
    await this.open();
    const report = await this.tauriDevice.receiveFeatureReport(REPORT_GET_SIGNAL_STRENGTH);
    const payload = featureReportPayload(report, REPORT_GET_SIGNAL_STRENGTH);
    const rssi = payload.byteLength > 0 ? payload.getInt8(0) : 0;
    const flags = payload.byteLength > 1 ? payload.getUint8(1) : 0;
    const flagsValid = (flags & AUDIO_FLAGS_VALID) !== 0;
    return {
      signalStrength: rssi < 0 ? rssi : null,
      micActive: flagsValid ? (flags & 0x01) !== 0 : null,
      speakerActive: flagsValid ? (flags & 0x02) !== 0 : null,
    };
  }

  async readBatteryText(timeoutMs: number): Promise<string | null> {
    await this.open();
    const report = await this.tauriDevice.readInputReport(timeoutMs);
    return report ? parseDualSenseBatteryText(report) : null;
  }

  async saveToFlash(): Promise<void> {
    await this.open();
    await this.tauriDevice.sendFeatureReport(REPORT_SET_CONFIG, commandReport(CMD_SAVE_TO_FLASH));
  }

  async reconnectUsb(): Promise<void> {
    await this.open();
    await this.tauriDevice.sendFeatureReport(REPORT_SET_CONFIG, commandReport(CMD_RECONNECT_USB));
    this.tauriDevice.opened = false;
  }

  async readSerialNumber(): Promise<string> {
    await this.open();

    const payload = new Uint8Array(new ArrayBuffer(FEATURE_REPORT_PAYLOAD_SIZE));
    payload[0] = DEVICE_SYSTEM;
    payload[1] = ACTION_READ_SERIAL_NUMBER;
    await this.tauriDevice.sendFeatureReport(REPORT_COMMAND, payload);

    for (let attempt = 0; attempt < 100; attempt += 1) {
      const report = await this.tauriDevice.receiveFeatureReport(REPORT_RESULT);

      if (isSerialNumberResult(report)) {
        return decodeSerialNumber(new DataView(report.buffer, report.byteOffset + 4, SERIAL_NUMBER_SIZE));
      }

      await sleep(10);
    }

    return this.device.serialNumber || "--";
  }
}

export async function startDeviceMonitor(): Promise<void> {
  await invoke("ds5_start_device_monitor");
}

export function tauriDeviceInfosToHidDevices(devices: TauriHidDeviceInfo[]): HIDDevice[] {
  return devices.map((device) => new TauriHidDevice(device) as unknown as HIDDevice);
}

/** One HID collection per dongle: the DualSense gamepad interface, or the Pro Controller. */
export function isAutoConnectCandidate(device: HIDDevice): boolean {
  return isDualSenseRuntimeDevice(device) || isSwitchProDevice(device);
}

export function isDualSenseRuntimeManagementDevice(device: HIDDevice): boolean {
  return isDualSenseRuntimeDevice(device);
}

export function isSwitchProDevice(device: HIDDevice): boolean {
  return device.vendorId === NINTENDO_VENDOR_ID && device.productId === SWITCH_PRO_PRODUCT_ID;
}

export function webHidAvailable(): boolean {
  return true;
}

export function getDeviceLabel(device: HIDDevice | null): string {
  if (!device) {
    return "No device";
  }

  const vendorId = device.vendorId.toString(16).padStart(4, "0").toUpperCase();
  const productId = device.productId.toString(16).padStart(4, "0").toUpperCase();
  const serialNumber = device.serialNumber?.trim();
  return `${device.productName || "DS5 Dongle"} · ${vendorId}:${productId}${serialNumber ? ` · ${serialNumber}` : ""}`;
}

export function getDeviceKey(device: HIDDevice): string {
  const path = (device as unknown as TauriHidDevice).info?.path;
  if (path) {
    const cachedKey = deviceSessionKeyByPath.get(path);
    if (cachedKey) {
      return cachedKey;
    }
    const key = device.serialNumber?.trim() ? `serial:${device.vendorId}:${device.productId}:${device.serialNumber}` : `path:${path}`;
    deviceSessionKeyByPath.set(path, key);
    return key;
  }

  return `session:${nextDeviceSessionId++}`;
}

export function getDevicePortKey(device: HIDDevice): string {
  const info = (device as unknown as TauriHidDevice).info;
  const path = info?.path.toLowerCase();
  if (!path) {
    return getDeviceKey(device);
  }

  const usbInstance = path.match(/vid_[0-9a-f]{4}&pid_[0-9a-f]{4}[^#]*/)?.[0];
  const normalizedInstance = usbInstance?.replace(/&mi_[0-9a-f]{2}.*/, "");
  if (normalizedInstance) {
    return `usb:${device.vendorId}:${device.productId}:${normalizedInstance}`;
  }

  return `path:${path.replace(/&col\d+/, "")}`;
}

export function getControllerIconSrc(device: HIDDevice | null): string {
  return device?.productId === DUALSENSE_EDGE_PRODUCT_ID ? "/images/ps5-controller-edge.webp" : "/svg/ps5-controller-gamepad-seeklogo.svg";
}

function isDualSenseDevice(device: HIDDevice): boolean {
  return device.vendorId === SONY_VENDOR_ID && SUPPORTED_PRODUCT_IDS.includes(device.productId as 0x0ce6 | 0x0df2);
}

function isDualSenseRuntimeDevice(device: HIDDevice): boolean {
  if (!isDualSenseDevice(device)) {
    return false;
  }

  const info = (device as unknown as TauriHidDevice).info;
  return info?.interfaceNumber === 3 || info?.usagePage === 1;
}

function commandReport(command: number): Uint8Array<ArrayBuffer> {
  const report = new Uint8Array(new ArrayBuffer(FEATURE_REPORT_PAYLOAD_SIZE));
  report[0] = command;
  return report;
}

function isSerialNumberResult(report: DataView): boolean {
  return (
    report.byteLength >= SERIAL_NUMBER_SIZE + 4 &&
    report.getUint8(0) === REPORT_RESULT &&
    report.getUint8(1) === DEVICE_SYSTEM &&
    report.getUint8(2) === ACTION_READ_SERIAL_NUMBER
  );
}

function featureReportPayload(report: DataView, reportId: number): DataView {
  if (report.byteLength > 0 && report.getUint8(0) === reportId) {
    return new DataView(report.buffer, report.byteOffset + 1, report.byteLength - 1);
  }

  return report;
}

function decodeSerialNumber(data: DataView): string {
  return new TextDecoder("shift_jis").decode(data).replace(/\0/g, "").trim();
}

function decodeNullTerminatedText(data: DataView): string {
  return new TextDecoder().decode(data).replace(/\0/g, "").trim();
}

export function sanitizeFirmwareVersion(version: string): string {
  const normalized = version.trim();
  return normalized.length > 0 ? normalized : "--";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function bytesToDataView(bytes: number[]): DataView {
  const buffer = new Uint8Array(bytes).buffer;
  return new DataView(buffer);
}

function parseDualSenseBatteryText(report: DataView): string | null {
  const reportId = report.byteLength > 0 ? report.getUint8(0) : 0;
  const status0Offset = reportId === 0x31 ? 54 : 53;
  if (report.byteLength <= status0Offset) {
    return null;
  }

  const status0 = report.getUint8(status0Offset);
  const chargeStatus = (status0 & 0xf0) >> 4;
  let level = status0 & 0x0f;

  if (chargeStatus === 2) {
    level = 10;
  }

  return level >= 10 ? "100%" : `${Math.min(level * 10 + 5, 100)}%`;
}

function debugFeatureReport(label: string, reportId: number, data: DataView): void {
  if (!import.meta.env.DEV) {
    return;
  }

  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  console.info(`[DS5 Dongle HID] ${label}`, {
    reportId: `0x${reportId.toString(16).padStart(2, "0")}`,
    byteLength: data.byteLength,
    hex: [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join(" "),
  });
}
