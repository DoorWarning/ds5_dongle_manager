import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  ConfigBody,
  ConfigDecodeError,
  ControllerMode,
  DEFAULT_CONFIG,
  ConfigValidationIssue,
  configsEqual,
  normalizeConfig,
  validateConfig,
} from "../protocol/config";
import { CompanionError, CompanionStatus, DongleControllerMode, PROTOCOL_NS_EDIT, type DongleInfo } from "../protocol/companion";
import {
  nsSettingsEqual,
  readMacro,
  readMacroInfo,
  readNsSettings,
  writeMacro,
  writeNsSettings,
  type MacroEvent,
  type MacroInfo,
  type NsSettings,
} from "../protocol/nsSettings";
import {
  Ds5BridgeHidClient,
  NO_DEVICE_SELECTED_ERROR,
  TauriHidDeviceInfo,
  WEBHID_UNAVAILABLE_ERROR,
  getControllerIconSrc,
  getDeviceLabel,
  isAutoConnectCandidate,
  isDualSenseRuntimeManagementDevice,
  isSwitchProDevice,
  getDeviceKey,
  getDevicePortKey,
  startDeviceMonitor,
  tauriDeviceInfosToHidDevices,
  webHidAvailable,
} from "../protocol/ds5BridgeHid";

type Operation = "connecting" | "reading" | "applying" | "saving" | "reconnecting" | "switchingMode" | null;
type SaveState = "idle" | "dirty" | "applied" | "saved";
export type NsSaveState = "idle" | "dirty" | "saving" | "saved";
const NS_SAVE_DELAY_MS = 250;
export type DongleMode = "pc" | "ns";
const BATTERY_REFRESH_INTERVAL_MS = 60_000;
const DEVICE_DISCOVERY_FALLBACK_INTERVAL_MS = 30_000;
const PICO_INFO_REFRESH_INTERVAL_MS = 1_000;
const NS_INFO_REFRESH_INTERVAL_MS = 2_000;
const CONNECTED_DEVICE_MISSING_GRACE_MS = 3_000;
const CONTROLLER_CONNECTION_NOTIFICATION_STABLE_MS = 900;
const BATTERY_LISTEN_TIMEOUT_MS = 300;
const AUTHORIZED_DEVICE_INFO_REFRESH_INTERVAL_MS = 5 * 60_000;
const SWITCH_RECONNECT_WINDOW_MS = 30_000;
const LOW_BATTERY_THRESHOLD_PERCENT = 15;
const AUTO_CONNECT_RETRY_COOLDOWN_MS = 10_000;
const LAST_PC_CONTROLLER_MODE_KEY = "last-pc-controller-mode";
// Fields that change the USB descriptors, so they only take effect after re-enumeration.
const USB_RECONNECT_FIELDS: ReadonlyArray<keyof ConfigBody> = [
  "pollingRateMode",
  "controllerMode",
  "enableUsbSn",
  "enableWake",
  "psShortcutEnabled",
];

export type ControllerNotificationSound = "connected" | "disconnected" | "lowBattery";

export interface ControllerNotificationSoundVolumes {
  connected: number;
  disconnected: number;
  lowBattery: number;
}

export interface UseDs5BridgeResult {
  supported: boolean;
  client: Ds5BridgeHidClient | null;
  deviceLabel: string;
  deviceSerialNumber: string;
  batteryText: string;
  firmwareVersion: string;
  signalStrength: string;
  /** Active dongle mode: PC (DualSense) or NS (Pro Controller). */
  dongleMode: DongleMode | null;
  /** Companion GET_INFO reply; null on firmware without the companion protocol. */
  dongleInfo: DongleInfo | null;
  ds5Connected: boolean;
  /** NS mode with firmware that lets the app edit NS settings and macros. */
  nsEditable: boolean;
  /** Live NS settings on the dongle, and the app's edited copy (saved automatically). */
  nsSettings: NsSettings | null;
  nsDraft: NsSettings | null;
  nsSaveState: NsSaveState;
  macroInfo: MacroInfo | null;
  micActive: boolean | null;
  speakerActive: boolean | null;
  authorizedDeviceSerialNumber: Record<string, string>;
  authorizedDeviceBatteryText: Record<string, string>;
  authorizedDeviceFirmwareVersion: Record<string, string>;
  authorizedDeviceSignalStrength: Record<string, string>;
  authorizedDevices: HIDDevice[];
  config: ConfigBody | null;
  draft: ConfigBody;
  issues: ConfigValidationIssue[];
  saveState: SaveState;
  operation: Operation;
  error: string | null;
  statusText: string;
  shouldReturnHome: boolean;
  shouldReturnHomeRef: RefObject<boolean>;
  isConnected: boolean;
  isRuntimeConfigConnected: boolean;
  isDirty: boolean;
  isDefaultConfig: boolean;
  needsUsbReconnect: boolean;
  pendingUsbReconnectPrompt: boolean;
  lowBatteryNotificationEnabled: boolean;
  controllerConnectionPopupEnabled: boolean;
  controllerLowBatteryPopupEnabled: boolean;
  controllerNotificationPopupDurationMs: number;
  controllerNotificationSoundEnabled: boolean;
  controllerNotificationSoundVolumes: ControllerNotificationSoundVolumes;
  switchReadyToken: number;
  connectedControllerProductId: number | null;
  setDraftField: <Key extends keyof ConfigBody>(field: Key, value: ConfigBody[Key]) => void;
  setLowBatteryNotificationEnabled: (enabled: boolean) => Promise<void>;
  setControllerConnectionPopupEnabled: (enabled: boolean) => Promise<void>;
  setControllerLowBatteryPopupEnabled: (enabled: boolean) => Promise<void>;
  setControllerNotificationPopupDurationMs: (durationMs: number) => Promise<void>;
  setControllerNotificationSoundEnabled: (enabled: boolean) => Promise<void>;
  setControllerNotificationSoundVolume: (sound: ControllerNotificationSound, volume: number) => Promise<void>;
  resetControllerNotificationSoundVolumes: () => Promise<void>;
  testLowBatteryNotification: () => Promise<void>;
  testControllerNotificationSound: (sound: ControllerNotificationSound) => Promise<void>;
  refreshAuthorizedDevices: () => Promise<void>;
  connect: () => Promise<void>;
  connectAuthorized: (device: HIDDevice) => Promise<void>;
  readConfig: () => Promise<void>;
  saveToFlash: () => Promise<void>;
  reconnectUsb: () => Promise<void>;
  applyPendingUsbReconnect: () => Promise<void>;
  dismissPendingUsbReconnectPrompt: () => void;
  /** Saves the target mode on the dongle, which then reboots into it. */
  switchDongleMode: (mode: DongleMode) => Promise<boolean>;
  setWakeLearning: (on: boolean) => Promise<void>;
  forgetWakeBeacon: () => Promise<void>;
  setNsDraft: (next: NsSettings) => void;
  readMacroSlot: (slot: number) => Promise<MacroEvent[]>;
  writeMacroSlot: (slot: number, events: MacroEvent[]) => Promise<boolean>;
  resetToDefaults: () => Promise<void>;
  clearReturnHome: () => void;
  clearError: () => void;
}

export function useDs5Bridge(): UseDs5BridgeResult {
  const { t, i18n } = useTranslation();
  const supported = webHidAvailable();
  const [client, setClient] = useState<Ds5BridgeHidClient | null>(null);
  const [authorizedDevices, setAuthorizedDevices] = useState<HIDDevice[]>([]);
  const [config, setConfig] = useState<ConfigBody | null>(null);
  const [draft, setDraft] = useState<ConfigBody>(DEFAULT_CONFIG);
  const [operation, setOperation] = useState<Operation>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [needsUsbReconnect, setNeedsUsbReconnect] = useState(false);
  const [pendingUsbReconnectPrompt, setPendingUsbReconnectPrompt] = useState(false);
  const [lowBatteryNotificationEnabled, setLowBatteryNotificationEnabledState] = useState(true);
  const [controllerConnectionPopupEnabled, setControllerConnectionPopupEnabledState] = useState(true);
  const [controllerLowBatteryPopupEnabled, setControllerLowBatteryPopupEnabledState] = useState(true);
  const [controllerNotificationPopupDurationMs, setControllerNotificationPopupDurationMsState] = useState(4_000);
  const [controllerNotificationSoundEnabled, setControllerNotificationSoundEnabledState] = useState(true);
  const [controllerNotificationSoundVolumes, setControllerNotificationSoundVolumes] = useState<ControllerNotificationSoundVolumes>(DEFAULT_CONTROLLER_NOTIFICATION_SOUND_VOLUMES);
  const [shouldReturnHome, setShouldReturnHome] = useState(false);
  const shouldReturnHomeRef = useRef(false);
  const [switchReadyToken, setSwitchReadyToken] = useState(0);
  const [connectedControllerProductId, setConnectedControllerProductId] = useState<number | null>(null);
  const [batteryText, setBatteryText] = useState("--");
  const [firmwareVersion, setFirmwareVersion] = useState("--");
  const [signalStrength, setSignalStrength] = useState("--");
  const [dongleInfo, setDongleInfo] = useState<DongleInfo | null>(null);
  const [ds5Connected, setDs5Connected] = useState(false);
  const [nsSettings, setNsSettings] = useState<NsSettings | null>(null);
  const [nsDraft, setNsDraftState] = useState<NsSettings | null>(null);
  const [nsSaveState, setNsSaveState] = useState<NsSaveState>("idle");
  const [macroInfo, setMacroInfo] = useState<MacroInfo | null>(null);
  const nsDraftRef = useRef<NsSettings | null>(null);
  const nsWriteTimerRef = useRef<number | null>(null);
  const nsWritingRef = useRef(false);
  const macroBusyRef = useRef(false);
  const [micActive, setMicActive] = useState<boolean | null>(null);
  const [speakerActive, setSpeakerActive] = useState<boolean | null>(null);
  const [deviceSerialNumber, setDeviceSerialNumber] = useState("--");
  const [authorizedDeviceSerialNumber, setAuthorizedDeviceSerialNumber] = useState<Record<string, string>>({});
  const [authorizedDeviceBatteryText, setAuthorizedDeviceBatteryText] = useState<Record<string, string>>({});
  const [authorizedDeviceFirmwareVersion, setAuthorizedDeviceFirmwareVersion] = useState<Record<string, string>>({});
  const [authorizedDeviceSignalStrength, setAuthorizedDeviceSignalStrength] = useState<Record<string, string>>({});
  const [settledStatusText, setSettledStatusText] = useState(t("status.ready"));
  const clientRef = useRef<Ds5BridgeHidClient | null>(null);
  const batteryTextRef = useRef("--");
  const firmwareVersionRef = useRef("--");
  const signalStrengthRef = useRef("--");
  const deviceSerialNumberRef = useRef("--");
  const configRef = useRef<ConfigBody | null>(null);
  const draftRef = useRef<ConfigBody>(DEFAULT_CONFIG);
  const applyingRef = useRef(false);
  const applyQueuedRef = useRef(false);
  const autoSaveTimerRef = useRef<number | null>(null);
  const savedStatusTimerRef = useRef<number | null>(null);
  const expectedUsbDisconnectRef = useRef(false);
  const autoConnectDeviceKeyRef = useRef<string | null>(null);
  const reconnectingDevicePortKeyRef = useRef<string | null>(null);
  const reconnectingDeviceTimeoutRef = useRef<number | null>(null);
  // Set while the dongle reboots into another mode; it comes back with a different VID/PID.
  const modeSwitchTargetRef = useRef<DongleMode | null>(null);
  const pendingUsbReconnectDevicePortKeyRef = useRef<string | null>(null);
  const companionMissingRef = useRef(new WeakSet<Ds5BridgeHidClient>());
  const autoConnectInFlightKeyRef = useRef<string | null>(null);
  const failedAutoConnectAtRef = useRef<Record<string, number>>({});
  const pendingDisconnectDeviceKeyRef = useRef<string | null>(null);
  const pendingDisconnectTimerRef = useRef<number | null>(null);
  const authorizedDeviceInfoScanIdRef = useRef(0);
  const pendingChangedFieldsRef = useRef<Set<keyof ConfigBody>>(new Set());
  const windowVisibleRef = useRef(typeof document === "undefined" ? true : document.visibilityState === "visible");
  const lowBatteryNotificationEnabledRef = useRef(true);
  const controllerConnectionPopupEnabledRef = useRef(true);
  const controllerLowBatteryPopupEnabledRef = useRef(true);
  const controllerNotificationPopupDurationMsRef = useRef(4_000);
  const lowBatteryNotifiedKeyRef = useRef<Set<string>>(new Set());
  const controllerNotificationSoundEnabledRef = useRef(true);
  const controllerNotificationSoundVolumesRef = useRef<ControllerNotificationSoundVolumes>(DEFAULT_CONTROLLER_NOTIFICATION_SOUND_VOLUMES);
  const realControllerConnectedRef = useRef(false);
  const notifiedControllerConnectedRef = useRef(false);
  const controllerNotificationTimerRef = useRef<number | null>(null);
  const lastTrayBatteriesSignatureRef = useRef("");
  const isRuntimeConfigConnected = Boolean(client?.device.opened && isDualSenseRuntimeManagementDevice(client.device));
  const dongleMode: DongleMode | null = client ? (client.isSwitchMode ? "ns" : "pc") : null;
  const nsEditable = dongleMode === "ns" && (dongleInfo?.protocol ?? 0) >= PROTOCOL_NS_EDIT;

  const issues = useMemo(() => validateConfig(draft), [draft]);
  const isConnected = Boolean(client?.device.opened);
  const isDirty = !configsEqual(config, draft);
  const isDefaultConfig = configsEqual(draft, DEFAULT_CONFIG);
  const deviceLabel = getDeviceLabel(client?.device ?? null);

  const statusText = useMemo(() => {
    if (!supported) {
      return t("status.webHidUnavailable");
    }
    if (operation) {
      return operationLabel(operation, t);
    }
    if (!client) {
      return t("status.ready");
    }
    if (saveState === "applied") {
      return t("status.applied");
    }
    if (saveState === "saved") {
      return t("status.saved");
    }
    return t("status.connected");
  }, [client, operation, saveState, supported, t]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSettledStatusText(statusText), 120);
    return () => window.clearTimeout(timer);
  }, [statusText]);

  useEffect(() => {
    batteryTextRef.current = batteryText;
  }, [batteryText]);

  useEffect(() => {
    firmwareVersionRef.current = firmwareVersion;
  }, [firmwareVersion]);

  useEffect(() => {
    signalStrengthRef.current = signalStrength;
  }, [signalStrength]);

  useEffect(() => {
    deviceSerialNumberRef.current = deviceSerialNumber;
  }, [deviceSerialNumber]);

  const setAuthorizedDevicesIfChanged = useCallback((nextDevices: HIDDevice[]) => {
    setAuthorizedDevices((currentDevices) => devicesEqual(currentDevices, nextDevices) ? currentDevices : nextDevices);
  }, []);

  const refreshAuthorizedDevices = useCallback(async () => {
    if (!supported) {
      setAuthorizedDevicesIfChanged([]);
      return;
    }

    setAuthorizedDevicesIfChanged(await Ds5BridgeHidClient.authorizedDevices());
  }, [setAuthorizedDevicesIfChanged, supported]);

  const scanAuthorizedDeviceInfo = useCallback(async (devices: HIDDevice[]) => {
    const scanId = authorizedDeviceInfoScanIdRef.current + 1;
    authorizedDeviceInfoScanIdRef.current = scanId;

    const entries = devices.map((device) => [
      getDeviceKey(device),
      clientRef.current?.device === device
        ? {
          batteryText: batteryTextRef.current,
          serialNumber: deviceSerialNumberRef.current,
          firmwareVersion: firmwareVersionRef.current,
          signalStrength: signalStrengthRef.current,
        }
        : {
          batteryText: authorizedDeviceBatteryText[getDeviceKey(device)] ?? "--",
          serialNumber: authorizedDeviceSerialNumber[getDeviceKey(device)] ?? device.serialNumber?.trim() ?? "--",
          firmwareVersion: authorizedDeviceFirmwareVersion[getDeviceKey(device)] ?? "--",
          signalStrength: authorizedDeviceSignalStrength[getDeviceKey(device)] ?? "--",
        },
    ] as const);

    if (authorizedDeviceInfoScanIdRef.current !== scanId) {
      return;
    }

    setAuthorizedDeviceBatteryText((current) => replaceRecordIfChanged(current, Object.fromEntries(entries.map(([key, value]) => [key, value.batteryText]))));
    setAuthorizedDeviceSerialNumber((current) => replaceRecordIfChanged(current, Object.fromEntries(entries.map(([key, value]) => [key, value.serialNumber]))));
    setAuthorizedDeviceFirmwareVersion((current) => replaceRecordIfChanged(current, Object.fromEntries(entries.map(([key, value]) => [key, value.firmwareVersion]))));
    setAuthorizedDeviceSignalStrength((current) => replaceRecordIfChanged(current, Object.fromEntries(entries.map(([key, value]) => [key, value.signalStrength]))));
  }, [authorizedDeviceBatteryText, authorizedDeviceFirmwareVersion, authorizedDeviceSerialNumber, authorizedDeviceSignalStrength]);

  const readConfigWithClient = useCallback(async (nextClient: Ds5BridgeHidClient) => {
    setOperation("reading");
    try {
      const nextConfig = normalizeConfig(await nextClient.readConfig());
      configRef.current = nextConfig;
      draftRef.current = nextConfig;
      setNeedsUsbReconnect(false);
      setConfig(nextConfig);
      setDraft(nextConfig);
      setSaveState("idle");
      setError(null);
      rememberPcControllerMode(nextConfig.controllerMode);
      return nextConfig;
    } finally {
      setOperation(null);
    }
  }, []);

  const clearReconnectTracking = useCallback(() => {
    reconnectingDevicePortKeyRef.current = null;
    modeSwitchTargetRef.current = null;
    if (reconnectingDeviceTimeoutRef.current !== null) {
      window.clearTimeout(reconnectingDeviceTimeoutRef.current);
      reconnectingDeviceTimeoutRef.current = null;
    }
  }, []);

  const startReconnectWindow = useCallback((portKey: string | null, modeTarget: DongleMode | null) => {
    reconnectingDevicePortKeyRef.current = portKey;
    modeSwitchTargetRef.current = modeTarget;
    if (reconnectingDeviceTimeoutRef.current !== null) {
      window.clearTimeout(reconnectingDeviceTimeoutRef.current);
    }
    reconnectingDeviceTimeoutRef.current = window.setTimeout(() => {
      reconnectingDevicePortKeyRef.current = null;
      modeSwitchTargetRef.current = null;
      reconnectingDeviceTimeoutRef.current = null;
    }, SWITCH_RECONNECT_WINDOW_MS);
  }, []);

  const cancelPendingConnectedDeviceDisconnect = useCallback(() => {
    pendingDisconnectDeviceKeyRef.current = null;
    if (pendingDisconnectTimerRef.current !== null) {
      window.clearTimeout(pendingDisconnectTimerRef.current);
      pendingDisconnectTimerRef.current = null;
    }
  }, []);

  const resetConfigState = useCallback(() => {
    configRef.current = null;
    draftRef.current = DEFAULT_CONFIG;
    setConfig(null);
    setDraft(DEFAULT_CONFIG);
    setSaveState("idle");
  }, []);

  const resetNsState = useCallback(() => {
    if (nsWriteTimerRef.current !== null) {
      window.clearTimeout(nsWriteTimerRef.current);
      nsWriteTimerRef.current = null;
    }
    nsDraftRef.current = null;
    setNsSettings(null);
    setNsDraftState(null);
    setNsSaveState("idle");
    setMacroInfo(null);
  }, []);

  const clearConnectedDevice = useCallback((options: { preserveConfig?: boolean; preserveReconnectTracking?: boolean } = {}) => {
    clientRef.current = null;
    autoConnectDeviceKeyRef.current = null;
    cancelPendingConnectedDeviceDisconnect();
    setClient(null);
    setConnectedControllerProductId(null);

    if (!options.preserveReconnectTracking) {
      clearReconnectTracking();
    }

    if (!options.preserveConfig && !shouldReturnHomeRef.current) {
      resetConfigState();
    }

    setNeedsUsbReconnect(false);
    setPendingUsbReconnectPrompt(false);
    pendingUsbReconnectDevicePortKeyRef.current = null;
    setBatteryText("--");
    setFirmwareVersion("--");
    setSignalStrength("--");
    setDongleInfo(null);
    resetNsState();
    setDs5Connected(false);
    setMicActive(null);
    setSpeakerActive(null);
    setDeviceSerialNumber("--");
  }, [cancelPendingConnectedDeviceDisconnect, clearReconnectTracking, resetConfigState, resetNsState]);

  const setLowBatteryNotificationEnabled = useCallback(async (enabled: boolean) => {
    lowBatteryNotificationEnabledRef.current = enabled;
    setLowBatteryNotificationEnabledState(enabled);

    if (!enabled) {
      lowBatteryNotifiedKeyRef.current.clear();
    }

    await invoke("ds5_set_low_battery_notification_enabled", { enabled });
  }, []);

  const setControllerConnectionPopupEnabled = useCallback(async (enabled: boolean) => {
    controllerConnectionPopupEnabledRef.current = enabled;
    setControllerConnectionPopupEnabledState(enabled);
    await invoke("ds5_set_controller_connection_popup_enabled", { enabled });
  }, []);

  const setControllerLowBatteryPopupEnabled = useCallback(async (enabled: boolean) => {
    controllerLowBatteryPopupEnabledRef.current = enabled;
    setControllerLowBatteryPopupEnabledState(enabled);
    await invoke("ds5_set_controller_low_battery_popup_enabled", { enabled });
  }, []);

  const setControllerNotificationPopupDurationMs = useCallback(async (durationMs: number) => {
    const normalizedDurationMs = normalizePopupDurationMs(durationMs);
    controllerNotificationPopupDurationMsRef.current = normalizedDurationMs;
    setControllerNotificationPopupDurationMsState(normalizedDurationMs);

    await invoke<number>("ds5_set_controller_notification_popup_duration_ms", { durationMs: normalizedDurationMs })
      .then((nextDurationMs) => {
        const normalizedNextDurationMs = normalizePopupDurationMs(nextDurationMs);
        controllerNotificationPopupDurationMsRef.current = normalizedNextDurationMs;
        setControllerNotificationPopupDurationMsState(normalizedNextDurationMs);
      })
      .catch(() => undefined);
  }, []);

  const setControllerNotificationSoundEnabled = useCallback(async (enabled: boolean) => {
    controllerNotificationSoundEnabledRef.current = enabled;
    setControllerNotificationSoundEnabledState(enabled);
    await invoke("ds5_set_controller_notification_sound_enabled", { enabled });
  }, []);

  const setControllerNotificationSoundVolume = useCallback(async (sound: ControllerNotificationSound, volume: number) => {
    const nextVolumes = {
      ...controllerNotificationSoundVolumesRef.current,
      [sound]: normalizeNotificationVolume(volume),
    };
    controllerNotificationSoundVolumesRef.current = nextVolumes;
    setControllerNotificationSoundVolumes(nextVolumes);

    await invoke<ControllerNotificationSoundVolumes>("ds5_set_controller_notification_sound_volume", { sound, volume: nextVolumes[sound] })
      .then((volumes) => {
        const normalizedVolumes = normalizeNotificationVolumes(volumes);
        controllerNotificationSoundVolumesRef.current = normalizedVolumes;
        setControllerNotificationSoundVolumes(normalizedVolumes);
      })
      .catch(() => undefined);
  }, []);

  const resetControllerNotificationSoundVolumes = useCallback(async () => {
    controllerNotificationSoundVolumesRef.current = DEFAULT_CONTROLLER_NOTIFICATION_SOUND_VOLUMES;
    setControllerNotificationSoundVolumes(DEFAULT_CONTROLLER_NOTIFICATION_SOUND_VOLUMES);

    await invoke<ControllerNotificationSoundVolumes>("ds5_reset_controller_notification_sound_volumes")
      .then((volumes) => {
        const normalizedVolumes = normalizeNotificationVolumes(volumes);
        controllerNotificationSoundVolumesRef.current = normalizedVolumes;
        setControllerNotificationSoundVolumes(normalizedVolumes);
      })
      .catch(() => undefined);
  }, []);

  const playControllerNotificationSound = useCallback(async (sound: ControllerNotificationSound) => {
    if (!controllerNotificationSoundEnabledRef.current || controllerNotificationSoundVolumesRef.current[sound] <= 0) {
      return;
    }

    await invoke("ds5_play_controller_notification_sound", { sound }).catch(() => undefined);
  }, []);

  const showControllerConnectionNotification = useCallback((
    kind: "connected" | "disconnected",
    deviceLabel: string,
    batteryText: string,
    batteryTexts: string[],
  ) => {
    if (!controllerConnectionPopupEnabledRef.current) {
      return;
    }

    void invoke("ds5_show_controller_notification", {
      kind,
      deviceLabel,
      iconSrc: null,
      batteryText,
      batteryTexts,
      durationMs: controllerNotificationPopupDurationMsRef.current,
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    realControllerConnectedRef.current = ds5Connected;

    if (controllerNotificationTimerRef.current !== null) {
      window.clearTimeout(controllerNotificationTimerRef.current);
      controllerNotificationTimerRef.current = null;
    }

    if (ds5Connected === notifiedControllerConnectedRef.current) {
      return;
    }

    const expectedConnected = ds5Connected;
    const battery = batteryText;

    controllerNotificationTimerRef.current = window.setTimeout(() => {
      controllerNotificationTimerRef.current = null;
      if (realControllerConnectedRef.current !== expectedConnected || notifiedControllerConnectedRef.current === expectedConnected) {
        return;
      }

      notifiedControllerConnectedRef.current = expectedConnected;
      if (expectedConnected) {
        void playControllerNotificationSound("connected");
        showControllerConnectionNotification("connected", "DualSense Wireless Controller", battery, battery !== "--" ? [battery] : []);
        return;
      }

      void playControllerNotificationSound("disconnected");
      showControllerConnectionNotification("disconnected", t("notifications.testDevice"), "--", []);
    }, CONTROLLER_CONNECTION_NOTIFICATION_STABLE_MS);
  }, [batteryText, ds5Connected, playControllerNotificationSound, showControllerConnectionNotification, t]);

  const testControllerNotificationSound = useCallback(async (sound: ControllerNotificationSound) => {
    await playControllerNotificationSound(sound);
  }, [playControllerNotificationSound]);

  const updateLowBatterySoundState = useCallback((device: HIDDevice, nextBatteryText: string) => {
    const deviceKey = getDeviceKey(device);
    const percent = parseBatteryPercent(nextBatteryText);
    if (!lowBatteryNotificationEnabledRef.current || percent === null || percent > LOW_BATTERY_THRESHOLD_PERCENT) {
      lowBatteryNotifiedKeyRef.current.delete(deviceKey);
      return;
    }

    if (!lowBatteryNotifiedKeyRef.current.has(deviceKey)) {
      lowBatteryNotifiedKeyRef.current.add(deviceKey);
      if (controllerLowBatteryPopupEnabledRef.current) {
        void invoke("ds5_show_controller_notification", {
          kind: "lowBattery",
          deviceLabel: "DualSense Wireless Controller",
          iconSrc: getControllerIconSrc(device),
          batteryText: nextBatteryText,
          batteryTexts: [nextBatteryText],
          durationMs: controllerNotificationPopupDurationMsRef.current,
        }).catch(() => undefined);
      }
      void playControllerNotificationSound("lowBattery");
    }
  }, [playControllerNotificationSound]);

  const testLowBatteryNotification = useCallback(async () => {
    await Promise.all([
      controllerLowBatteryPopupEnabledRef.current
        ? invoke("ds5_show_controller_notification", {
          kind: "lowBattery",
          deviceLabel: t("notifications.testDevice"),
          iconSrc: getControllerIconSrc(null),
          batteryText: "15%",
          batteryTexts: ["15%"],
          durationMs: controllerNotificationPopupDurationMsRef.current,
        }).catch(() => undefined)
        : Promise.resolve(),
      playControllerNotificationSound("lowBattery"),
    ]);
  }, [playControllerNotificationSound, t]);

  const applyBatteryText = useCallback((device: HIDDevice, nextBatteryText: string) => {
    setBatteryText(nextBatteryText);
    if (nextBatteryText !== "--") {
      updateLowBatterySoundState(device, nextBatteryText);
    }
  }, [updateLowBatterySoundState]);

  // NS settings can change from the controller shortcuts too, so they are polled;
  // an edit in progress is not overwritten.
  const refreshNsState = useCallback(async (target: Ds5BridgeHidClient) => {
    if (macroBusyRef.current) {
      return;
    }
    const [nextSettings, nextMacroInfo] = await Promise.all([
      readNsSettings(target.companion),
      readMacroInfo(target.companion),
    ]);
    if (clientRef.current !== target) {
      return;
    }
    setMacroInfo(nextMacroInfo);
    setNsSettings((current) => nsSettingsEqual(current, nextSettings) ? current : nextSettings);
    if (nsWriteTimerRef.current === null && !nsWritingRef.current) {
      nsDraftRef.current = nextSettings;
      setNsDraftState((current) => nsSettingsEqual(current, nextSettings) ? current : nextSettings);
    }
  }, []);

  /** Polls dongle state. Throws when the device stopped answering. */
  const refreshDongleInfo = useCallback(async (target: Ds5BridgeHidClient) => {
    const info = companionMissingRef.current.has(target)
      ? null
      : await target.companion.getInfo().catch((cause) => {
        if (target.isSwitchMode) {
          throw cause;
        }
        // Older PC-mode firmware has no 0xFA report; stop asking this device.
        companionMissingRef.current.add(target);
        return null;
      });
    if (clientRef.current !== target) {
      return;
    }

    setDongleInfo(info);
    if (info) {
      setFirmwareVersion(normalizeStatusDisplayValue(info.firmware));
      setDs5Connected(info.ds5Connected);
      applyBatteryText(target.device, info.ds5Connected ? formatBattery(info.batteryPercent) : "--");
    }

    if (target.isSwitchMode) {
      setSignalStrength("--");
      if (info && info.protocol >= PROTOCOL_NS_EDIT) {
        await refreshNsState(target);
      }
      return;
    }

    const [nextFirmwareVersion, status] = await Promise.all([
      info ? Promise.resolve(info.firmware) : target.readFirmwareVersion().catch(() => "--"),
      target.readPicoBridgeStatus(),
    ]);
    if (clientRef.current !== target) {
      return;
    }

    setFirmwareVersion(normalizeStatusDisplayValue(nextFirmwareVersion));
    setSignalStrength(formatSignalStrength(status.signalStrength));
    setMicActive(status.micActive);
    setSpeakerActive(status.speakerActive);
    if (!info) {
      // Pre-companion firmware: a real RSSI means a DualSense is connected.
      setDs5Connected(status.signalStrength !== null);
    }
  }, [applyBatteryText, refreshNsState]);

  const handleConnectedDeviceDisconnected = useCallback((expectedDisconnect = false) => {
    if (!expectedDisconnect) {
      shouldReturnHomeRef.current = false;
      setShouldReturnHome(false);
    }

    expectedUsbDisconnectRef.current = false;
    clearConnectedDevice({
      preserveConfig: expectedDisconnect || shouldReturnHomeRef.current,
      preserveReconnectTracking: expectedDisconnect || shouldReturnHomeRef.current,
    });
  }, [clearConnectedDevice]);

  const scheduleConnectedDeviceDisconnectCheck = useCallback((targetClient?: Ds5BridgeHidClient | null) => {
    const candidateClient = targetClient ?? clientRef.current;
    if (!candidateClient) {
      cancelPendingConnectedDeviceDisconnect();
      return;
    }

    const deviceKey = getDeviceKey(candidateClient.device);
    if (pendingDisconnectDeviceKeyRef.current === deviceKey && pendingDisconnectTimerRef.current !== null) {
      return;
    }

    cancelPendingConnectedDeviceDisconnect();
    pendingDisconnectDeviceKeyRef.current = deviceKey;
    pendingDisconnectTimerRef.current = window.setTimeout(() => {
      pendingDisconnectTimerRef.current = null;
      pendingDisconnectDeviceKeyRef.current = null;

      const currentClient = clientRef.current;
      if (!currentClient || getDeviceKey(currentClient.device) !== deviceKey) {
        return;
      }

      void Ds5BridgeHidClient.authorizedDevices()
        .then((nextDevices) => {
          setAuthorizedDevicesIfChanged(nextDevices);
          const activeClient = clientRef.current;
          if (!activeClient || getDeviceKey(activeClient.device) !== deviceKey) {
            return;
          }
          if (deviceListIncludes(nextDevices, activeClient.device)) {
            return;
          }
          handleConnectedDeviceDisconnected(expectedUsbDisconnectRef.current);
        })
        .catch(() => {
          const activeClient = clientRef.current;
          if (activeClient && getDeviceKey(activeClient.device) === deviceKey && !activeClient.device.opened) {
            handleConnectedDeviceDisconnected(expectedUsbDisconnectRef.current);
          }
        });
    }, CONNECTED_DEVICE_MISSING_GRACE_MS);
  }, [cancelPendingConnectedDeviceDisconnect, handleConnectedDeviceDisconnected, setAuthorizedDevicesIfChanged]);

  const reconcileConnectedDevicePresence = useCallback((devices: HIDDevice[]) => {
    const connectedClient = clientRef.current;
    if (!connectedClient) {
      cancelPendingConnectedDeviceDisconnect();
      return;
    }

    if (deviceListIncludes(devices, connectedClient.device)) {
      cancelPendingConnectedDeviceDisconnect();
      return;
    }

    scheduleConnectedDeviceDisconnectCheck(connectedClient);
  }, [cancelPendingConnectedDeviceDisconnect, scheduleConnectedDeviceDisconnectCheck]);

  const attachClient = useCallback(
    async (nextClient: Ds5BridgeHidClient) => {
      const isSwitchReconnect = shouldReturnHomeRef.current || Boolean(reconnectingDevicePortKeyRef.current) || Boolean(modeSwitchTargetRef.current);
      setOperation("connecting");
      const previousClient = clientRef.current;
      try {
        if (previousClient && previousClient.device !== nextClient.device) {
          await previousClient.close().catch(() => undefined);
        }
        await nextClient.open();

        // A Pro Controller is only ours if it answers the companion protocol.
        if (nextClient.isSwitchMode) {
          await nextClient.companion.getInfo().catch(() => {
            throw new Error(NOT_A_DONGLE_ERROR);
          });
        }

        clientRef.current = nextClient;
        setClient(nextClient);
        cancelPendingConnectedDeviceDisconnect();
        clearReconnectTracking();
        setError(null);
      } finally {
        setOperation(null);
      }

      if (nextClient.isSwitchMode) {
        // PC-mode config is not reachable over the Pro Controller interface.
        resetConfigState();
        setNeedsUsbReconnect(false);
        setDeviceSerialNumber(nextClient.device.serialNumber?.trim() || "--");
      } else {
        try {
          await readConfigWithClient(nextClient);
        } catch (cause) {
          if (!isSwitchReconnect) {
            clientRef.current = null;
            setClient(null);
            throw cause;
          }
          setError(null);
          setNeedsUsbReconnect(false);
        }

        setDeviceSerialNumber((await nextClient.readSerialNumber().catch(() => null)) || "--");
        const nextBatteryText = await nextClient.readBatteryText(BATTERY_LISTEN_TIMEOUT_MS).catch(() => null);
        if (nextBatteryText) {
          applyBatteryText(nextClient.device, nextBatteryText);
        }
      }

      setConnectedControllerProductId(nextClient.device.productId ?? null);
      await refreshDongleInfo(nextClient).catch(() => undefined);
      setSwitchReadyToken((token) => token + 1);
    },
    [applyBatteryText, cancelPendingConnectedDeviceDisconnect, clearReconnectTracking, readConfigWithClient, refreshDongleInfo, resetConfigState],
  );

  const connectDeviceSilently = useCallback(async (device: HIDDevice) => {
    const deviceKey = getDeviceKey(device);
    if (autoConnectInFlightKeyRef.current === deviceKey) {
      return;
    }

    autoConnectInFlightKeyRef.current = deviceKey;
    try {
      await attachClient(new Ds5BridgeHidClient(device));
      delete failedAutoConnectAtRef.current[deviceKey];
    } catch (cause) {
      failedAutoConnectAtRef.current[deviceKey] = Date.now();
      autoConnectDeviceKeyRef.current = deviceKey;

      const quiet = shouldReturnHomeRef.current || reconnectingDevicePortKeyRef.current || modeSwitchTargetRef.current || isNotADongleError(cause);
      if (!quiet) {
        setError(errorMessage(cause, t));
      }
      setOperation(null);
    } finally {
      if (autoConnectInFlightKeyRef.current === deviceKey) {
        autoConnectInFlightKeyRef.current = null;
      }
    }
  }, [attachClient, t]);

  const connect = useCallback(async () => {
    try {
      await attachClient(await Ds5BridgeHidClient.requestDevice());
      await refreshAuthorizedDevices();
    } catch (cause) {
      if (!isNoDeviceSelectedError(cause) && !shouldReturnHomeRef.current && !reconnectingDevicePortKeyRef.current) {
        setError(errorMessage(cause, t));
      }
      setOperation(null);
    }
  }, [attachClient, refreshAuthorizedDevices, t]);

  const connectAuthorized = useCallback(
    async (device: HIDDevice) => {
      await connectDeviceSilently(device);
    },
    [connectDeviceSilently],
  );

  const applyLatestDraft = useCallback(async (): Promise<boolean> => {
    if (applyingRef.current) {
      applyQueuedRef.current = true;
      return false;
    }

    applyingRef.current = true;
    setOperation("applying");
    try {
      while (true) {
        applyQueuedRef.current = false;

        const nextClient = clientRef.current;
        if (!nextClient || nextClient.isSwitchMode) {
          break;
        }

        const nextDraft = normalizeConfig(draftRef.current);
        if (validateConfig(nextDraft).length > 0 || configsEqual(configRef.current, nextDraft)) {
          pendingChangedFieldsRef.current.clear();
          break;
        }

        const changedFields = new Set(pendingChangedFieldsRef.current);
        await nextClient.applyConfig(nextDraft);
        pendingChangedFieldsRef.current.clear();
        configRef.current = nextDraft;
        setConfig(nextDraft);
        rememberPcControllerMode(nextDraft.controllerMode);
        setSaveState("applied");
        setError(null);

        if (configsEqual(draftRef.current, nextDraft)) {
          draftRef.current = nextDraft;
          setDraft(nextDraft);
        }

        if (USB_RECONNECT_FIELDS.some((field) => changedFields.has(field))) {
          pendingUsbReconnectDevicePortKeyRef.current = getDevicePortKey(nextClient.device);
          setNeedsUsbReconnect(true);
          setPendingUsbReconnectPrompt(true);
          break;
        } else if (!pendingUsbReconnectDevicePortKeyRef.current) {
          setNeedsUsbReconnect(false);
        }

        if (!applyQueuedRef.current && configsEqual(configRef.current, draftRef.current)) {
          break;
        }
      }
    } catch (cause) {
      setError(errorMessage(cause, t));
      return false;
    } finally {
      applyingRef.current = false;
      setOperation(null);
    }

    return true;
  }, [t]);

  const saveToFlash = useCallback(async () => {
    const nextClient = clientRef.current;
    if (!nextClient || nextClient.isSwitchMode || !configsEqual(configRef.current, draftRef.current)) {
      return;
    }

    setOperation("saving");
    try {
      await nextClient.saveToFlash();
      setSaveState("saved");
      if (savedStatusTimerRef.current !== null) {
        window.clearTimeout(savedStatusTimerRef.current);
      }
      savedStatusTimerRef.current = window.setTimeout(() => {
        setSaveState("idle");
        savedStatusTimerRef.current = null;
      }, 900);
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause, t));
    } finally {
      setOperation(null);
    }
  }, [t]);

  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = window.setTimeout(async () => {
      autoSaveTimerRef.current = null;
      const applied = await applyLatestDraft();
      if (applied && configsEqual(configRef.current, draftRef.current)) {
        await saveToFlash();
      }
    }, 180);
  }, [applyLatestDraft, saveToFlash]);

  const readConfig = useCallback(async () => {
    const nextClient = clientRef.current;
    if (!nextClient) {
      return;
    }

    if (nextClient.isSwitchMode) {
      await refreshDongleInfo(nextClient).catch(() => scheduleConnectedDeviceDisconnectCheck(nextClient));
      return;
    }

    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    try {
      const applied = await applyLatestDraft();
      if (applied && configsEqual(configRef.current, draftRef.current)) {
        await saveToFlash();
      }
      await readConfigWithClient(nextClient);
    } catch (cause) {
      if (clientRef.current === nextClient) {
        scheduleConnectedDeviceDisconnectCheck(nextClient);
        return;
      }

      setError(errorMessage(cause, t));
      setOperation(null);
    }
  }, [applyLatestDraft, readConfigWithClient, refreshDongleInfo, saveToFlash, scheduleConnectedDeviceDisconnectCheck, t]);

  const reconnectUsb = useCallback(async () => {
    if (!client || client.isSwitchMode) {
      return;
    }

    setOperation("reconnecting");
    try {
      await client.reconnectUsb();
      setNeedsUsbReconnect(false);
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause, t));
    } finally {
      setOperation(null);
    }
  }, [client, t]);

  const applyPendingUsbReconnect = useCallback(async () => {
    const nextClient = clientRef.current;
    if (!nextClient || nextClient.isSwitchMode) {
      return;
    }

    const applied = await applyLatestDraft();
    if (!applied || !configsEqual(configRef.current, draftRef.current)) {
      return;
    }

    await saveToFlash();

    expectedUsbDisconnectRef.current = true;
    autoConnectDeviceKeyRef.current = null;
    startReconnectWindow(pendingUsbReconnectDevicePortKeyRef.current ?? getDevicePortKey(nextClient.device), null);

    shouldReturnHomeRef.current = true;
    setShouldReturnHome(true);
    setPendingUsbReconnectPrompt(false);
    setOperation("reconnecting");
    try {
      await nextClient.reconnectUsb();
    } catch {
      // The device can close immediately after the reconnect command is sent.
    } finally {
      setOperation(null);
    }
    clearConnectedDevice({ preserveConfig: true, preserveReconnectTracking: true });
  }, [applyLatestDraft, clearConnectedDevice, saveToFlash, startReconnectWindow]);

  const dismissPendingUsbReconnectPrompt = useCallback(() => {
    setPendingUsbReconnectPrompt(false);
  }, []);

  const switchDongleMode = useCallback(async (mode: DongleMode): Promise<boolean> => {
    const nextClient = clientRef.current;
    if (!nextClient || (mode === "ns") === nextClient.isSwitchMode) {
      return false;
    }

    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    const target = mode === "ns" ? DongleControllerMode.SwitchPro : (readPcControllerMode() as number as DongleControllerMode);
    setOperation("switchingMode");
    try {
      await nextClient.companion.setMode(target);
    } catch (cause) {
      setError(isCompanionMissingError(cause) ? t("errors.companionUnsupported") : errorMessage(cause, t));
      setOperation(null);
      return false;
    }

    expectedUsbDisconnectRef.current = true;
    autoConnectDeviceKeyRef.current = null;
    startReconnectWindow(null, mode);
    shouldReturnHomeRef.current = true;
    setShouldReturnHome(true);
    setOperation(null);
    clearConnectedDevice({ preserveConfig: false, preserveReconnectTracking: true });
    return true;
  }, [clearConnectedDevice, startReconnectWindow, t]);

  const runWakeCommand = useCallback(async (command: (target: Ds5BridgeHidClient) => Promise<void>) => {
    const target = clientRef.current;
    if (!target) {
      return;
    }
    try {
      await command(target);
      await refreshDongleInfo(target);
    } catch (cause) {
      setError(isCompanionMissingError(cause) ? t("errors.companionUnsupported") : errorMessage(cause, t));
    }
  }, [refreshDongleInfo, t]);

  const setWakeLearning = useCallback(
    (on: boolean) => runWakeCommand((target) => target.companion.setWakeLearning(on)),
    [runWakeCommand],
  );

  const forgetWakeBeacon = useCallback(
    () => runWakeCommand((target) => target.companion.forgetWakeBeacon()),
    [runWakeCommand],
  );

  const flushNsDraft = useCallback(async () => {
    nsWriteTimerRef.current = null;
    const target = clientRef.current;
    const draftToWrite = nsDraftRef.current;
    if (!target || !draftToWrite || nsWritingRef.current) {
      return;
    }
    nsWritingRef.current = true;
    setNsSaveState("saving");
    try {
      await writeNsSettings(target.companion, draftToWrite);
      if (clientRef.current === target) {
        setNsSettings(draftToWrite);
        setNsSaveState(nsDraftRef.current === draftToWrite ? "saved" : "dirty");
      }
    } catch (cause) {
      setNsSaveState("dirty");
      setError(errorMessage(cause, t));
    } finally {
      nsWritingRef.current = false;
    }
    // Edits made while writing go out next.
    if (nsDraftRef.current !== draftToWrite && clientRef.current === target) {
      nsWriteTimerRef.current = window.setTimeout(() => void flushNsDraft(), NS_SAVE_DELAY_MS);
    }
  }, [t]);

  const setNsDraft = useCallback((next: NsSettings) => {
    nsDraftRef.current = next;
    setNsDraftState(next);
    setNsSaveState("dirty");
    if (nsWriteTimerRef.current !== null) {
      window.clearTimeout(nsWriteTimerRef.current);
    }
    nsWriteTimerRef.current = window.setTimeout(() => void flushNsDraft(), NS_SAVE_DELAY_MS);
  }, [flushNsDraft]);

  const readMacroSlot = useCallback(async (slot: number): Promise<MacroEvent[]> => {
    const target = clientRef.current;
    if (!target) {
      return [];
    }
    macroBusyRef.current = true;
    try {
      const info = await readMacroInfo(target.companion);
      setMacroInfo(info);
      return await readMacro(target.companion, slot, info.counts[slot] ?? 0);
    } finally {
      macroBusyRef.current = false;
    }
  }, []);

  const writeMacroSlot = useCallback(async (slot: number, events: MacroEvent[]): Promise<boolean> => {
    const target = clientRef.current;
    if (!target) {
      return false;
    }
    macroBusyRef.current = true;
    try {
      await writeMacro(target.companion, slot, events);
      setMacroInfo(await readMacroInfo(target.companion));
      return true;
    } catch (cause) {
      const busy = cause instanceof CompanionError && cause.status === CompanionStatus.Busy;
      setError(busy ? t("macro.busy") : errorMessage(cause, t));
      return false;
    } finally {
      macroBusyRef.current = false;
    }
  }, [t]);

  const setDraftField = useCallback(
    <Key extends keyof ConfigBody>(field: Key, value: ConfigBody[Key]) => {
      if (!clientRef.current?.device || !isDualSenseRuntimeManagementDevice(clientRef.current.device)) {
        return;
      }
      const nextDraft = { ...draftRef.current, [field]: value };
      pendingChangedFieldsRef.current.add(field);
      draftRef.current = nextDraft;
      setDraft(nextDraft);
      setSaveState("dirty");
      scheduleAutoSave();
    },
    [scheduleAutoSave],
  );

  const resetToDefaults = useCallback(async () => {
    // Keep the active mode: resetting it would reboot the dongle into another descriptor.
    const nextDefaults = { ...DEFAULT_CONFIG, controllerMode: draftRef.current.controllerMode };
    draftRef.current = nextDefaults;
    pendingChangedFieldsRef.current = new Set(Object.keys(DEFAULT_CONFIG) as Array<keyof ConfigBody>);
    setDraft(nextDefaults);
    setSaveState("dirty");

    const applied = await applyLatestDraft();
    if (!applied || !configsEqual(configRef.current, nextDefaults)) {
      return;
    }

    await saveToFlash();
  }, [applyLatestDraft, saveToFlash]);

  useEffect(() => {
    void refreshAuthorizedDevices();
  }, [refreshAuthorizedDevices]);

  useEffect(() => {
    void invoke<boolean>("ds5_get_controller_notification_sound_enabled")
      .then((enabled) => {
        controllerNotificationSoundEnabledRef.current = enabled;
        setControllerNotificationSoundEnabledState(enabled);
      })
      .catch(() => undefined);

    void invoke<ControllerNotificationSoundVolumes>("ds5_get_controller_notification_sound_volumes")
      .then((volumes) => {
        const normalizedVolumes = normalizeNotificationVolumes(volumes);
        controllerNotificationSoundVolumesRef.current = normalizedVolumes;
        setControllerNotificationSoundVolumes(normalizedVolumes);
      })
      .catch(() => undefined);

    void invoke<boolean>("ds5_get_controller_connection_popup_enabled")
      .then((enabled) => {
        controllerConnectionPopupEnabledRef.current = enabled;
        setControllerConnectionPopupEnabledState(enabled);
      })
      .catch(() => undefined);

    void invoke<boolean>("ds5_get_controller_low_battery_popup_enabled")
      .then((enabled) => {
        controllerLowBatteryPopupEnabledRef.current = enabled;
        setControllerLowBatteryPopupEnabledState(enabled);
      })
      .catch(() => undefined);

    void invoke<number>("ds5_get_controller_notification_popup_duration_ms")
      .then((durationMs) => {
        const normalizedDurationMs = normalizePopupDurationMs(durationMs);
        controllerNotificationPopupDurationMsRef.current = normalizedDurationMs;
        setControllerNotificationPopupDurationMsState(normalizedDurationMs);
      })
      .catch(() => undefined);

    void invoke<boolean>("ds5_get_low_battery_notification_enabled")
      .then((enabled) => {
        lowBatteryNotificationEnabledRef.current = enabled;
        setLowBatteryNotificationEnabledState(enabled);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!supported) {
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | null = null;

    const handleVisibilityChange = () => {
      windowVisibleRef.current = document.visibilityState === "visible";
      if (windowVisibleRef.current) {
        void refreshAuthorizedDevices();
      }
    };

    windowVisibleRef.current = document.visibilityState === "visible";
    document.addEventListener("visibilitychange", handleVisibilityChange);

    void startDeviceMonitor().catch(() => undefined);
    void listen<TauriHidDeviceInfo[]>("ds5-devices-changed", (event) => {
      if (!disposed) {
        const nextDevices = tauriDeviceInfosToHidDevices(event.payload).filter((device) => Ds5BridgeHidClient.isSupportedDevice(device));
        setAuthorizedDevicesIfChanged(nextDevices);
        reconcileConnectedDevicePresence(nextDevices);
      }
    }).then((nextUnlisten) => {
      if (disposed) {
        nextUnlisten();
      } else {
        unlisten = nextUnlisten;
      }
    });

    const intervalId = window.setInterval(() => {
      if (windowVisibleRef.current) {
        void refreshAuthorizedDevices();
      }
    }, DEVICE_DISCOVERY_FALLBACK_INTERVAL_MS);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(intervalId);
      unlisten?.();
    };
  }, [reconcileConnectedDevicePresence, refreshAuthorizedDevices, setAuthorizedDevicesIfChanged, supported]);

  useEffect(() => {
    reconcileConnectedDevicePresence(authorizedDevices);
  }, [authorizedDevices, reconcileConnectedDevicePresence]);

  useEffect(() => {
    if (authorizedDevices.length === 0) {
      autoConnectDeviceKeyRef.current = null;
      setAuthorizedDeviceBatteryText((current) => replaceRecordIfChanged(current, {}));
      setAuthorizedDeviceSerialNumber((current) => replaceRecordIfChanged(current, {}));
      setAuthorizedDeviceFirmwareVersion((current) => replaceRecordIfChanged(current, {}));
      setAuthorizedDeviceSignalStrength((current) => replaceRecordIfChanged(current, {}));
      return;
    }

    void scanAuthorizedDeviceInfo(authorizedDevices);
    const intervalId = window.setInterval(() => {
      if (windowVisibleRef.current) {
        void scanAuthorizedDeviceInfo(authorizedDevices);
      }
    }, AUTHORIZED_DEVICE_INFO_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [authorizedDevices, scanAuthorizedDeviceInfo]);

  // Auto-connect: after a USB reconnect or mode switch, pick the dongle back up; otherwise the first candidate.
  useEffect(() => {
    if (!supported || clientRef.current || operation === "connecting" || operation === "reading") {
      return;
    }

    const modeTarget = modeSwitchTargetRef.current;
    if (modeTarget) {
      const switchedDevice = authorizedDevices.find((device) =>
        isAutoConnectCandidate(device) && isSwitchProDevice(device) === (modeTarget === "ns"),
      );
      if (switchedDevice) {
        autoConnectDeviceKeyRef.current = null;
        void connectDeviceSilently(switchedDevice);
      }
      return;
    }

    const reconnectingDevicePortKey = reconnectingDevicePortKeyRef.current;
    if (reconnectingDevicePortKey) {
      const reconnectedDevice = authorizedDevices.find(
        (device) => isAutoConnectCandidate(device) && getDevicePortKey(device) === reconnectingDevicePortKey,
      );
      // controller_mode changes can swap DS5 <-> DSE, so fall back to any DualSense-mode dongle.
      const fallbackDevice = reconnectedDevice ?? authorizedDevices.find(
        (device) => isDualSenseRuntimeManagementDevice(device),
      );

      if (fallbackDevice) {
        autoConnectDeviceKeyRef.current = null;
        void connectDeviceSilently(fallbackDevice);
      }
      return;
    }

    const now = Date.now();
    const nextDevice = authorizedDevices.find((device) => {
      if (!isAutoConnectCandidate(device)) {
        return false;
      }

      const failedAt = failedAutoConnectAtRef.current[getDeviceKey(device)] ?? 0;
      return now - failedAt >= AUTO_CONNECT_RETRY_COOLDOWN_MS;
    });
    if (!nextDevice) {
      autoConnectDeviceKeyRef.current = null;
      return;
    }

    const nextDeviceKey = getDeviceKey(nextDevice);
    if (autoConnectDeviceKeyRef.current === nextDeviceKey || autoConnectInFlightKeyRef.current === nextDeviceKey) {
      return;
    }

    autoConnectDeviceKeyRef.current = nextDeviceKey;
    void connectDeviceSilently(nextDevice);
  }, [authorizedDevices, connectDeviceSilently, operation, supported]);

  // Pre-companion firmware: read the battery from DualSense input reports.
  useEffect(() => {
    if (!supported) {
      return;
    }

    const refreshBatteryInfo = () => {
      const connectedClient = clientRef.current;
      if (!windowVisibleRef.current || !connectedClient?.device.opened || connectedClient.isSwitchMode || dongleInfo) {
        return;
      }

      void connectedClient.readBatteryText(BATTERY_LISTEN_TIMEOUT_MS).then((nextBatteryText) => {
        if (nextBatteryText && clientRef.current === connectedClient) {
          applyBatteryText(connectedClient.device, nextBatteryText);
        }
      }).catch(() => {
        if (clientRef.current === connectedClient) {
          scheduleConnectedDeviceDisconnectCheck(connectedClient);
        }
      });
    };

    const intervalId = window.setInterval(refreshBatteryInfo, BATTERY_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [applyBatteryText, dongleInfo, scheduleConnectedDeviceDisconnectCheck, supported]);

  useEffect(() => {
    const batteries = authorizedDevices.filter(isAutoConnectCandidate).map((device, index) => {
      const deviceKey = getDeviceKey(device);
      return {
        deviceKey,
        label: t("tray.controllerLabel", { index: index + 1 }),
        batteryText: clientRef.current?.device === device ? batteryText : (authorizedDeviceBatteryText[deviceKey] ?? "--"),
      };
    });
    const signature = JSON.stringify(batteries);
    if (lastTrayBatteriesSignatureRef.current === signature) {
      return;
    }
    lastTrayBatteriesSignatureRef.current = signature;

    void invoke("ds5_update_tray_batteries", { batteries }).catch(() => undefined);
  }, [authorizedDeviceBatteryText, authorizedDevices, batteryText, t]);

  useEffect(() => {
    const syncTrayLabels = () => {
      void invoke("ds5_update_tray_labels", {
        labels: {
          openWindow: t("tray.openWindow"),
          quit: t("tray.quit"),
          batteryPrefix: t("tray.batteryPrefix"),
        },
      }).catch(() => undefined);
    };

    syncTrayLabels();
    i18n.on("languageChanged", syncTrayLabels);
    return () => {
      i18n.off("languageChanged", syncTrayLabels);
    };
  }, [i18n, t]);

  useEffect(() => {
    if (!supported || !client) {
      return;
    }

    let inFlight = false;
    const refreshConnectedInfo = () => {
      const currentClient = clientRef.current;
      if (!windowVisibleRef.current || inFlight || !currentClient?.device.opened || operation !== null) {
        return;
      }

      inFlight = true;
      void refreshDongleInfo(currentClient)
        .catch(() => {
          if (clientRef.current === currentClient) {
            scheduleConnectedDeviceDisconnectCheck(currentClient);
          }
        })
        .finally(() => {
          inFlight = false;
        });
    };

    const intervalId = window.setInterval(
      refreshConnectedInfo,
      client.isSwitchMode ? NS_INFO_REFRESH_INTERVAL_MS : PICO_INFO_REFRESH_INTERVAL_MS,
    );
    return () => window.clearInterval(intervalId);
  }, [client, operation, refreshDongleInfo, scheduleConnectedDeviceDisconnectCheck, supported]);

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
      }
      if (savedStatusTimerRef.current !== null) {
        window.clearTimeout(savedStatusTimerRef.current);
      }
      if (controllerNotificationTimerRef.current !== null) {
        window.clearTimeout(controllerNotificationTimerRef.current);
      }
      if (reconnectingDeviceTimeoutRef.current !== null) {
        window.clearTimeout(reconnectingDeviceTimeoutRef.current);
      }
      if (pendingDisconnectTimerRef.current !== null) {
        window.clearTimeout(pendingDisconnectTimerRef.current);
      }
    };
  }, []);

  return {
    supported,
    client,
    deviceLabel,
    deviceSerialNumber,
    batteryText,
    firmwareVersion,
    signalStrength,
    dongleMode,
    dongleInfo,
    ds5Connected,
    nsEditable,
    nsSettings,
    nsDraft,
    nsSaveState,
    macroInfo,
    micActive,
    speakerActive,
    authorizedDeviceSerialNumber,
    authorizedDeviceBatteryText,
    authorizedDeviceFirmwareVersion,
    authorizedDeviceSignalStrength,
    authorizedDevices,
    config,
    draft,
    issues,
    saveState,
    operation,
    error,
    statusText: settledStatusText,
    shouldReturnHome,
    shouldReturnHomeRef,
    isConnected,
    isRuntimeConfigConnected,
    isDirty,
    isDefaultConfig,
    needsUsbReconnect,
    pendingUsbReconnectPrompt,
    lowBatteryNotificationEnabled,
    controllerConnectionPopupEnabled,
    controllerLowBatteryPopupEnabled,
    controllerNotificationPopupDurationMs,
    controllerNotificationSoundEnabled,
    controllerNotificationSoundVolumes,
    switchReadyToken,
    connectedControllerProductId,
    setDraftField,
    setLowBatteryNotificationEnabled,
    setControllerConnectionPopupEnabled,
    setControllerLowBatteryPopupEnabled,
    setControllerNotificationPopupDurationMs,
    setControllerNotificationSoundEnabled,
    setControllerNotificationSoundVolume,
    resetControllerNotificationSoundVolumes,
    testLowBatteryNotification,
    testControllerNotificationSound,
    refreshAuthorizedDevices,
    connect,
    connectAuthorized,
    readConfig,
    saveToFlash,
    reconnectUsb,
    applyPendingUsbReconnect,
    dismissPendingUsbReconnectPrompt,
    switchDongleMode,
    setWakeLearning,
    forgetWakeBeacon,
    setNsDraft,
    readMacroSlot,
    writeMacroSlot,
    resetToDefaults,
    clearReturnHome: () => {
      shouldReturnHomeRef.current = false;
      setShouldReturnHome(false);
    },
    clearError: () => setError(null),
  };
}

const NOT_A_DONGLE_ERROR = "notADongle";

const DEFAULT_CONTROLLER_NOTIFICATION_SOUND_VOLUMES: ControllerNotificationSoundVolumes = {
  connected: 0.65,
  disconnected: 0.65,
  lowBattery: 0.75,
};

function normalizeNotificationVolume(volume: number): number {
  return Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0;
}

function normalizePopupDurationMs(durationMs: number): number {
  return Number.isFinite(durationMs) ? Math.max(2_000, Math.min(15_000, Math.round(durationMs))) : 4_000;
}

function normalizeNotificationVolumes(volumes: Partial<ControllerNotificationSoundVolumes> | null | undefined): ControllerNotificationSoundVolumes {
  return {
    connected: normalizeNotificationVolume(volumes?.connected ?? DEFAULT_CONTROLLER_NOTIFICATION_SOUND_VOLUMES.connected),
    disconnected: normalizeNotificationVolume(volumes?.disconnected ?? DEFAULT_CONTROLLER_NOTIFICATION_SOUND_VOLUMES.disconnected),
    lowBattery: normalizeNotificationVolume(volumes?.lowBattery ?? DEFAULT_CONTROLLER_NOTIFICATION_SOUND_VOLUMES.lowBattery),
  };
}

function parseBatteryPercent(batteryText: string): number | null {
  const match = batteryText.match(/(\d{1,3})\s*%/);
  if (!match) {
    return null;
  }

  return Math.max(0, Math.min(100, Number(match[1])));
}

function formatBattery(percent: number | null): string {
  return percent === null ? "--" : `${percent}%`;
}

function formatSignalStrength(rssi: number | null): string {
  return typeof rssi === "number" && rssi <= -1 && rssi >= -127 ? `${rssi} dBm` : "--";
}

function normalizeStatusDisplayValue(value: string | null | undefined): string {
  const normalized = value?.trim();
  return normalized ? normalized : "--";
}

/** The PC-side controller_mode to restore when leaving NS mode (NS mode cannot read the PC config). */
function rememberPcControllerMode(mode: ControllerMode): void {
  if (mode === DongleControllerMode.SwitchPro) {
    return;
  }
  try {
    localStorage.setItem(LAST_PC_CONTROLLER_MODE_KEY, String(mode));
  } catch {
    // Falls back to Auto on the way back.
  }
}

function readPcControllerMode(): ControllerMode {
  try {
    const stored = Number(localStorage.getItem(LAST_PC_CONTROLLER_MODE_KEY));
    if (stored === 0 || stored === 1 || stored === 2) {
      return stored;
    }
  } catch {
    // Ignore storage failures.
  }
  return DongleControllerMode.Auto as number as ControllerMode;
}

function operationLabel(operation: Exclude<Operation, null>, t: (key: string) => string): string {
  switch (operation) {
    case "connecting":
      return t("status.connecting");
    case "reading":
      return t("status.reading");
    case "applying":
      return t("status.applying");
    case "saving":
      return t("status.saving");
    case "reconnecting":
      return t("status.reconnecting");
    case "switchingMode":
      return t("status.switchingMode");
  }
}

function deviceListIncludes(devices: HIDDevice[], target: HIDDevice): boolean {
  const targetKey = getDeviceKey(target);
  return devices.some((device) => getDeviceKey(device) === targetKey);
}

function devicesEqual(left: HIDDevice[], right: HIDDevice[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((device, index) => getDeviceKey(device) === getDeviceKey(right[index]));
}

function replaceRecordIfChanged(current: Record<string, string>, next: Record<string, string>): Record<string, string> {
  const currentKeys = Object.keys(current);
  const nextKeys = Object.keys(next);
  if (currentKeys.length !== nextKeys.length) {
    return next;
  }

  return nextKeys.every((key) => current[key] === next[key]) ? current : next;
}

function errorMessage(cause: unknown, t: (key: string, values?: Record<string, unknown>) => string): string {
  if (cause instanceof ConfigDecodeError) {
    if (cause.code === "invalidConfig") {
      const fields = Array.isArray(cause.values.issues) ? cause.values.issues : [];
      const issues = fields.map((field) => t(`validation.${String(field)}`)).join("; ");

      return t("errors.invalidConfig", { issues });
    }

    return t("errors.invalidBytes", cause.values);
  }

  if (cause instanceof Error) {
    if (cause.message === NO_DEVICE_SELECTED_ERROR) {
      return t("errors.noDeviceSelected");
    }

    if (cause.message === WEBHID_UNAVAILABLE_ERROR) {
      return t("errors.webHidUnavailable");
    }

    return cause.message;
  }

  if (typeof cause === "string") {
    return cause;
  }

  return t("errors.unexpectedWebHid");
}

function isNoDeviceSelectedError(cause: unknown): boolean {
  return cause instanceof Error && cause.message === NO_DEVICE_SELECTED_ERROR;
}

function isNotADongleError(cause: unknown): boolean {
  return cause instanceof Error && cause.message === NOT_A_DONGLE_ERROR;
}

/** Pre-companion firmware stalls the 0xFA feature report, so the exchange fails outright. */
function isCompanionMissingError(cause: unknown): boolean {
  if (!(cause instanceof CompanionError) || cause.status === undefined) {
    return true;
  }
  // Older companion firmware answers newer commands with "unknown command".
  return cause.status === CompanionStatus.UnknownCommand;
}
