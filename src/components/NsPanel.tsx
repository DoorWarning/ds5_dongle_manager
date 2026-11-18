import { useState } from "react";
import {
  BatteryFull,
  Crosshair,
  Gamepad2,
  Keyboard,
  ListVideo,
  Plug,
  Power,
  Repeat,
  Save,
  SlidersHorizontal,
  Timer,
  Vibrate,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageTabs, Section, Stat, StatusChip } from "./config/PanelParts";
import type { UseDs5BridgeResult } from "@/hooks/useDs5Bridge";
import {
  MACRO_SLOTS,
  NS_TRIGGER_SLOTS,
  REPORT_MS_MAX,
  REPORT_MS_MIN,
  REPORT_MS_REAL_PRO,
  TURBO_BUTTONS,
  TURBO_RATE_MAX,
  TURBO_RATE_MIN,
  type NsSettings,
} from "@/protocol/nsSettings";
import { DongleModeSection } from "./config/DongleModeSection";
import { IntegerControl } from "./config/IntegerControl";
import { ToggleControl } from "./config/ToggleControl";
import { MacroEditor, SLOT_SYMBOLS } from "./ns/MacroEditor";
import { TriggerSlotEditor } from "./ns/TriggerSlotEditor";

interface NsPanelProps {
  bridge: UseDs5BridgeResult;
  onProgressComplete?: () => void;
}

const TURBO_LABELS: Record<(typeof TURBO_BUTTONS)[number]["key"], string> = {
  circle: "○",
  cross: "✕",
  triangle: "△",
  square: "□",
  l1: "L1",
  r1: "R1",
  l2: "L2",
  r2: "R2",
};

const LATENCY_PRESETS = [REPORT_MS_REAL_PRO, 8, 5, 2, 1] as const;

const SHORTCUT_KEYS = ["vibration", "trigger", "turboOn", "turboOff", "macroRecord", "macroPlay", "macroLoop", "macroStop", "modeToggle"] as const;

const TABS = [
  { key: "general", icon: SlidersHorizontal },
  { key: "trigger", icon: Crosshair },
  { key: "turboMacro", icon: Repeat },
  { key: "wake", icon: Power },
  { key: "shortcuts", icon: Keyboard },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/**
 * NS (Switch Pro) mode page. Settings are edited live while the dongle is in NS
 * mode and saved automatically; the controller shortcuts change the same values.
 */
export function NsPanel({ bridge, onProgressComplete }: NsPanelProps) {
  const { t } = useTranslation();
  const info = bridge.dongleInfo;
  const inNsMode = bridge.dongleMode === "ns";
  const draft = bridge.nsDraft;
  const editable = bridge.nsEditable && draft !== null;
  const [tab, setTab] = useState<TabKey>("general");
  const [editSlot, setEditSlot] = useState<number | null>(null);
  const [triggerSlot, setTriggerSlot] = useState<number | null>(null);
  const shownTriggerSlot = triggerSlot ?? (draft ? draft.triggerMode - 1 : 0);

  const update = (mutate: (next: NsSettings) => NsSettings) => {
    if (draft) {
      bridge.setNsDraft(mutate(draft));
    }
  };

  if (editSlot !== null) {
    return (
      <Card className="panel config-panel">
        <CardContent className="config-sections p-0">
          <MacroEditor bridge={bridge} slot={editSlot} onClose={() => setEditSlot(null)} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="panel config-panel ns-panel">
      <div className="ns-status-bar">
        <StatusChip icon={<Gamepad2 size={14} />} on={inNsMode}>
          {bridge.dongleMode ? t(`mode.names.${bridge.dongleMode}`) : "--"}
        </StatusChip>
        <StatusChip icon={<BatteryFull size={14} />} on={inNsMode && bridge.ds5Connected}>
          {inNsMode && bridge.ds5Connected
            ? `${t("device.ds5Connected")} · ${bridge.batteryText}`
            : t("device.ds5Disconnected")}
        </StatusChip>
        {editable && (
          <StatusChip icon={<Save size={14} />} on={bridge.nsSaveState === "saved"}>
            {t(`ns.saveState.${bridge.nsSaveState}`)}
          </StatusChip>
        )}
      </div>

      {!inNsMode && <div className="config-tip ns-notice">{t("ns.pcModeNotice")}</div>}
      {inNsMode && !bridge.nsEditable && info && <div className="config-tip ns-notice">{t("ns.firmwareTooOld")}</div>}

      <PageTabs tabs={TABS} value={tab} label={(key) => t(`ns.tabs.${key}`)} onChange={setTab} />

      <CardContent className="config-sections p-0">
        {tab === "general" && (
          <>
            <DongleModeSection bridge={bridge} onProgressComplete={onProgressComplete} />

            <Section icon={<Vibrate size={17} />} title={t("ns.sections.vibration")} description={t("ns.sections.vibrationDescription")}>
              <IntegerControl
                label={`${t("ns.vibration")} (%)`}
                description={t("ns.vibrationDescription")}
                value={draft?.vibPercent ?? 0}
                min={0}
                max={100}
                disabled={!editable}
                onChange={(value) => update((next) => ({ ...next, vibPercent: value }))}
              />
            </Section>

            <Section icon={<Plug size={17} />} title={t("ns.sections.dock")} description={t("ns.sections.dockDescription")}>
              {bridge.nsDock === null ? (
                <div className="config-tip">{t("ns.dockUnavailable")}</div>
              ) : (
                <>
                  <ToggleControl
                    label={t("config.disconnectOnDock")}
                    description={t("config.disconnectOnDockDescription")}
                    value={bridge.nsDock.disconnect}
                    disabled={!inNsMode}
                    onChange={(value) => void bridge.setNsDock({ ...bridge.nsDock!, disconnect: value })}
                  />
                  <ToggleControl
                    label={t("ns.sleepConsoleOnDock")}
                    description={t("ns.sleepConsoleOnDockDescription")}
                    value={bridge.nsDock.sleepConsole}
                    disabled={!inNsMode}
                    onChange={(value) => void bridge.setNsDock({ ...bridge.nsDock!, sleepConsole: value })}
                  />
                </>
              )}
            </Section>

            <Section wide icon={<Timer size={17} />} title={t("ns.sections.latency")} description={t("ns.sections.latencyDescription")}>
              {draft && draft.reportMs === null ? (
                <div className="config-tip">{t("latency.firmwareTooOld")}</div>
              ) : (
                <div className="ns-two-column">
                  <div className="ns-column">
                    <div className="ns-editor-toolbar">
                      <span className="ns-editor-label">{t("latency.presets")}</span>
                      {LATENCY_PRESETS.map((ms) => (
                        <Button
                          key={ms}
                          type="button"
                          size="sm"
                          variant={draft?.reportMs === ms ? "secondary" : "ghost"}
                          disabled={!editable}
                          onClick={() => update((next) => ({ ...next, reportMs: ms }))}
                        >
                          {t(ms === REPORT_MS_REAL_PRO ? "latency.presetReal" : "latency.presetMs", { ms })}
                        </Button>
                      ))}
                    </div>
                    <IntegerControl
                      label={t("latency.reportMs")}
                      description={t("latency.reportMsDescription")}
                      value={draft?.reportMs ?? REPORT_MS_REAL_PRO}
                      min={REPORT_MS_MIN}
                      max={REPORT_MS_MAX}
                      disabled={!editable}
                      onChange={(value) => update((next) => ({ ...next, reportMs: value }))}
                    />
                    <ToggleControl
                      label={t("latency.gyroComp")}
                      description={t("latency.gyroCompDescription")}
                      value={draft?.gyroComp ?? false}
                      disabled={!editable || (draft?.reportMs ?? REPORT_MS_REAL_PRO) === REPORT_MS_REAL_PRO}
                      onChange={(value) => update((next) => ({ ...next, gyroComp: value }))}
                    />
                  </div>
                  <div className="ns-column">
                    {bridge.latency ? (
                      <div className="ns-stats">
                        <Stat label={t("latency.ds5Rate")} value={`${bridge.latency.ds5Hz}`} unit="Hz" />
                        <Stat label={t("latency.reportRate")} value={`${bridge.latency.reportHz}`} unit="Hz" />
                        <Stat
                          label={t("latency.pressWait")}
                          value={((draft?.reportMs ?? REPORT_MS_REAL_PRO) / 2).toFixed(1)}
                          unit="ms"
                        />
                        <Stat label={t("latency.usbInterval")} value={`${bridge.latency.usbIntervalMs}`} unit="ms" />
                      </div>
                    ) : (
                      <div className="config-tip">{t("ns.latencyWaiting")}</div>
                    )}
                    {bridge.latency && draft?.reportMs != null &&
                      (bridge.latency.usbIntervalMs === 1) !== (draft.reportMs < REPORT_MS_REAL_PRO) && (
                      <div className="config-tip">{t("latency.reconnectNeeded")}</div>
                    )}
                    <div className="config-tip">{t("latency.help")}</div>
                  </div>
                </div>
              )}
            </Section>
          </>
        )}

        {tab === "trigger" && (
          <Section wide icon={<Crosshair size={17} />} title={t("ns.sections.trigger")} description={t("ns.sections.triggerDescription")}>
            <div className={`control-row control-row-plain ${!editable ? "is-disabled" : ""}`}>
              <strong>{t("trigger.activeMode")}</strong>
              <em>{t("trigger.activeModeDescription")}</em>
              <Tabs
                value={String(draft?.triggerMode ?? 1)}
                onValueChange={(next) => {
                  update((current) => ({ ...current, triggerMode: Number(next) }));
                  setTriggerSlot(Number(next) - 1);
                }}
                className="w-full"
              >
                <TabsList className="grid h-10 w-full grid-cols-4">
                  {Array.from({ length: NS_TRIGGER_SLOTS }, (_, index) => (
                    <TabsTrigger key={index} value={String(index + 1)} disabled={!editable} className="h-8 text-sm font-bold">
                      {index + 1}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
            {draft ? (
              <>
                <div className="ns-editor-toolbar">
                  <span className="ns-editor-label">{t("trigger.editingSlot")}</span>
                  {Array.from({ length: NS_TRIGGER_SLOTS }, (_, index) => (
                    <Button
                      key={index}
                      type="button"
                      size="sm"
                      variant={index === shownTriggerSlot ? "secondary" : "ghost"}
                      onClick={() => setTriggerSlot(index)}
                    >
                      {index + 1}
                    </Button>
                  ))}
                </div>
                <TriggerSlotEditor
                  key={shownTriggerSlot}
                  slot={draft.slots[shownTriggerSlot]}
                  disabled={!editable}
                  onChange={(slot) => update((next) => ({
                    ...next,
                    slots: next.slots.map((current, index) => (index === shownTriggerSlot ? slot : current)),
                  }))}
                />
              </>
            ) : (
              <div className="config-tip">{t("ns.pcModeNotice")}</div>
            )}
          </Section>
        )}

        {tab === "turboMacro" && (
          <>
            <Section icon={<Repeat size={17} />} title={t("ns.sections.turbo")} description={t("ns.sections.turboDescription")}>
              <div className={`control-row control-row-plain ${!editable ? "is-disabled" : ""}`}>
                <strong>{t("turbo.buttons")}</strong>
                <em>{t("turbo.buttonsDescription")}</em>
                <div className="ns-turbo-buttons">
                  {TURBO_BUTTONS.map((button) => {
                    const on = ((draft?.turboMask ?? 0) & button.bit) !== 0;
                    return (
                      <button
                        key={button.key}
                        type="button"
                        disabled={!editable}
                        className={`ns-macro-button ns-turbo-button ${on ? "is-on" : ""}`}
                        onClick={() => update((next) => ({ ...next, turboMask: next.turboMask ^ button.bit }))}
                      >
                        {TURBO_LABELS[button.key]}
                      </button>
                    );
                  })}
                </div>
              </div>
              <IntegerControl
                label={t("turbo.rate")}
                description={t("turbo.rateDescription")}
                value={draft?.turboRate ?? 10}
                min={TURBO_RATE_MIN}
                max={TURBO_RATE_MAX}
                disabled={!editable}
                onChange={(value) => update((next) => ({ ...next, turboRate: value }))}
              />
            </Section>

            <Section icon={<ListVideo size={17} />} title={t("ns.sections.macro")} description={t("ns.sections.macroDescription")}>
              <div className="ns-slot-grid">
                {Array.from({ length: MACRO_SLOTS }, (_, slot) => {
                  const count = bridge.macroInfo?.counts[slot] ?? 0;
                  const playing = bridge.macroInfo?.activeSlot === slot ? bridge.macroInfo.status : null;
                  return (
                    <button
                      key={slot}
                      type="button"
                      className={`ns-slot-card ${count > 0 ? "has-steps" : ""}`}
                      disabled={!editable}
                      onClick={() => setEditSlot(slot)}
                    >
                      <span className="ns-slot-symbol">{SLOT_SYMBOLS[slot]}</span>
                      <span className="ns-slot-copy">
                        <strong>{count > 0 ? t("macro.slotSteps", { count }) : t("macro.slotEmpty")}</strong>
                        <small>
                          {playing && playing !== "idle"
                            ? t(`macro.status.${playing}`)
                            : t(count > 0 ? "macro.edit" : "macro.create")}
                        </small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </Section>
          </>
        )}

        {tab === "wake" && <WakeSection bridge={bridge} />}

        {tab === "shortcuts" && (
          <Section wide icon={<Keyboard size={17} />} title={t("ns.sections.shortcuts")} description={t("ns.sections.shortcutsDescription")}>
            <div className="ns-shortcut-list">
              {SHORTCUT_KEYS.map((key) => (
                <div key={key} className="ns-shortcut-row">
                  <kbd>{t(`ns.shortcuts.${key}.combo`)}</kbd>
                  <span>{t(`ns.shortcuts.${key}.action`)}</span>
                </div>
              ))}
            </div>
            <div className="config-tip">{t("ns.triggerModes")}</div>
          </Section>
        )}
      </CardContent>
    </Card>
  );
}

function WakeSection({ bridge }: { bridge: UseDs5BridgeResult }) {
  const { t } = useTranslation();
  const info = bridge.dongleInfo;
  const learning = Boolean(info?.wakeLearning);
  const disabled = !info || bridge.operation !== null;
  const status = !info
    ? "--"
    : t(learning ? "ns.wakeLearningNow" : info.wakeBeaconLearned ? "ns.wakeLearned" : "ns.wakeNotLearned");

  return (
    <Section wide icon={<Power size={17} />} title={t("ns.sections.wake")} description={t("ns.sections.wakeDescription")}>
      <div className="ns-stats ns-stats-single">
        <Stat label={t("ns.wakeBeacon")} value={status} />
      </div>
      <div className={`control-row control-row-action ${disabled ? "is-disabled" : ""}`}>
        <span>
          <strong>{t(learning ? "ns.wakeLearningTitle" : "ns.wakeLearnTitle")}</strong>
          <small>{t(learning ? "ns.wakeLearningSteps" : "ns.wakeLearnDescription")}</small>
        </span>
        <Button
          type="button"
          variant={learning ? "outline" : "secondary"}
          disabled={disabled}
          onClick={() => void bridge.setWakeLearning(!learning)}
        >
          {t(learning ? "ns.wakeLearnCancel" : "ns.wakeLearnStart")}
        </Button>
      </div>
      <div className={`control-row control-row-action ${disabled || !info?.wakeBeaconLearned ? "is-disabled" : ""}`}>
        <span>
          <strong>{t("ns.wakeForgetTitle")}</strong>
          <small>{t("ns.wakeForgetDescription")}</small>
        </span>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || !info?.wakeBeaconLearned}
          onClick={() => void bridge.forgetWakeBeacon()}
        >
          {t("ns.wakeForget")}
        </Button>
      </div>
      <div className="config-tip">{t("ns.wakeHelp")}</div>
    </Section>
  );
}
