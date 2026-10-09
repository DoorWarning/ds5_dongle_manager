import { Cpu, Gamepad2, Gauge, Monitor, Vibrate, Volume2, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEffect, useState, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UseDs5BridgeResult } from "../hooks/useDs5Bridge";
import {
  AUDIO_SELECT_OPTIONS,
  STATUS_GPIO_DISABLED,
  STATUS_GPIO_PINS,
  fieldIssue,
  type AudioSelect,
  type ControllerMode,
  type PollingRateMode,
  type StatusGpioMode,
} from "../protocol/config";
import { ChoiceControl } from "./config/ChoiceControl";
import { ControllerModeControl } from "./config/ControllerModeControl";
import { DongleModeSection } from "./config/DongleModeSection";
import { FloatControl } from "./config/FloatControl";
import { IntegerControl } from "./config/IntegerControl";
import { PollingRateControl } from "./config/PollingRateControl";
import { SwitchProgressDialog } from "./config/SwitchProgressDialog";
import { ToggleControl } from "./config/ToggleControl";
import { useReconnectProgress } from "./config/useReconnectProgress";

interface ConfigPanelProps {
  bridge: UseDs5BridgeResult;
  /** Called once the reconnect progress dialog has fully closed. */
  onProgressComplete?: () => void;
}

/** PC-mode settings: the firmware Config_body, read and written over Feature reports 0xF6/0xF7. */
export function ConfigPanel({ bridge, onProgressComplete }: ConfigPanelProps) {
  const { t } = useTranslation();
  const editable = bridge.isRuntimeConfigConnected;
  const controlsDisabled = !editable || bridge.operation !== null;
  const draft = bridge.draft;
  const progress = useReconnectProgress(bridge, onProgressComplete);
  const [usbReconnectPromptOpen, setUsbReconnectPromptOpen] = useState(false);

  useEffect(() => {
    setUsbReconnectPromptOpen(bridge.pendingUsbReconnectPrompt);
  }, [bridge.pendingUsbReconnectPrompt]);

  const closeUsbReconnectPrompt = () => {
    setUsbReconnectPromptOpen(false);
    bridge.dismissPendingUsbReconnectPrompt();
  };

  const audioOptions = AUDIO_SELECT_OPTIONS.map((value) => ({ value, label: t(`config.audioSelect.${value}`) }));

  return (
    <>
      <Card className="panel config-panel">
        <CardContent className="config-sections p-0">
          <DongleModeSection bridge={bridge} onProgressComplete={onProgressComplete} />

          {bridge.dongleMode === "ns" && <div className="config-tip">{t("config.pcOnlyNotice")}</div>}

          <Section icon={<Gamepad2 size={17} />} title={t("config.sections.compatibility")} description={t("config.sections.compatibilityDescription")}>
            <ControllerModeControl
              value={draft.controllerMode}
              disabled={controlsDisabled}
              onChange={(value: ControllerMode) => value !== draft.controllerMode && bridge.setDraftField("controllerMode", value)}
            />
            <ToggleControl
              label={t("config.enableUsbSn")}
              description={t("config.enableUsbSnDescription")}
              value={draft.enableUsbSn}
              disabled={controlsDisabled}
              onChange={(value) => bridge.setDraftField("enableUsbSn", value)}
            />
          </Section>

          <Section icon={<Gauge size={17} />} title={t("config.sections.performance")} description={t("config.sections.performanceDescription")}>
            <div className="config-tip">{t("config.pollingRateTip")}</div>
            <PollingRateControl
              value={draft.pollingRateMode}
              disabled={controlsDisabled}
              onChange={(value: PollingRateMode) => value !== draft.pollingRateMode && bridge.setDraftField("pollingRateMode", value)}
            />
          </Section>

          <Section icon={<Vibrate size={17} />} title={t("config.sections.haptics")} description={t("config.sections.hapticsDescription")}>
            <FloatControl
              label={`${t("config.hapticsGain")} (%)`}
              description={t("config.hapticsGainDescription")}
              value={draft.hapticsGain}
              min={1}
              max={2}
              step={0.05}
              displayScale={100}
              displayMin={100}
              displayMax={200}
              displayStep={5}
              fractionDigits={0}
              issue={fieldIssue(bridge.issues, "hapticsGain")}
              disabled={controlsDisabled}
              onChange={(value) => bridge.setDraftField("hapticsGain", value)}
            />
            <IntegerControl
              label={t("config.triggerReduce")}
              description={t("config.triggerReduceDescription")}
              value={draft.triggerReduce}
              min={0}
              max={10}
              disabled={controlsDisabled}
              issue={fieldIssue(bridge.issues, "triggerReduce")}
              onChange={(value) => bridge.setDraftField("triggerReduce", value)}
            />
            <IntegerControl
              label={t("config.audioBufferLength")}
              description={t("config.audioBufferLengthDescription")}
              value={draft.audioBufferLength}
              min={16}
              max={128}
              disabled={controlsDisabled}
              issue={fieldIssue(bridge.issues, "audioBufferLength")}
              onChange={(value) => bridge.setDraftField("audioBufferLength", value)}
            />
          </Section>

          <Section icon={<Volume2 size={17} />} title={t("config.sections.audio")} description={t("config.sections.audioDescription")}>
            <ChoiceControl<AudioSelect>
              label={t("config.speakerSelect")}
              description={statusSuffix(t, bridge.speakerActive)}
              value={draft.speakerSelect}
              options={audioOptions}
              disabled={controlsDisabled}
              onChange={(value) => bridge.setDraftField("speakerSelect", value)}
            />
            <ChoiceControl<AudioSelect>
              label={t("config.micSelect")}
              description={statusSuffix(t, bridge.micActive)}
              value={draft.micSelect}
              options={audioOptions}
              disabled={controlsDisabled}
              onChange={(value) => bridge.setDraftField("micSelect", value)}
            />
            <IntegerControl
              label={t("config.speakerGain")}
              description={t("config.speakerGainDescription")}
              value={draft.speakerGain}
              min={0}
              max={7}
              disabled={controlsDisabled}
              issue={fieldIssue(bridge.issues, "speakerGain")}
              onChange={(value) => bridge.setDraftField("speakerGain", value)}
            />
            <ToggleControl
              label={t("config.lockVolume")}
              description={t("config.lockVolumeDescription")}
              value={draft.lockVolume}
              disabled={controlsDisabled}
              onChange={(value) => bridge.setDraftField("lockVolume", value)}
            />
          </Section>

          <Section icon={<Monitor size={17} />} title={t("config.sections.pc")} description={t("config.sections.pcDescription")}>
            <ToggleControl
              label={t("config.enableWake")}
              description={t("config.enableWakeDescription")}
              value={draft.enableWake}
              disabled={controlsDisabled}
              onChange={(value) => bridge.setDraftField("enableWake", value)}
            />
            <ToggleControl
              label={t("config.psShortcutEnabled")}
              description={t("config.psShortcutEnabledDescription")}
              value={draft.psShortcutEnabled}
              disabled={controlsDisabled}
              onChange={(value) => bridge.setDraftField("psShortcutEnabled", value)}
            />
          </Section>

          <Section icon={<Zap size={17} />} title={t("config.sections.power")} description={t("config.sections.powerDescription")}>
            <IntegerControl
              label={`${t("config.inactiveTime")} (${t("config.inactiveTimeUnit")})`}
              description={t("config.inactiveTimeDescription")}
              value={draft.inactiveTime}
              min={0}
              max={60}
              disabled={controlsDisabled}
              issue={fieldIssue(bridge.issues, "inactiveTime")}
              onChange={(value) => bridge.setDraftField("inactiveTime", value)}
            />
            <ToggleControl
              label={t("config.disablePicoLed")}
              value={draft.disablePicoLed}
              disabled={controlsDisabled}
              onChange={(value) => bridge.setDraftField("disablePicoLed", value)}
            />
          </Section>

          <Section icon={<Cpu size={17} />} title={t("config.sections.statusGpio")} description={t("config.sections.statusGpioDescription")}>
            <label className={`control-row ${controlsDisabled ? "is-disabled" : ""}`}>
              <span>
                <strong>{t("config.statusGpioPin")}</strong>
                <em>{t("config.statusGpioPinDescription")}</em>
              </span>
              <select
                className="config-select"
                value={draft.statusGpioPin}
                disabled={controlsDisabled}
                onChange={(event) => bridge.setDraftField("statusGpioPin", Number(event.currentTarget.value))}
              >
                <option value={STATUS_GPIO_DISABLED}>{t("config.statusGpioDisabled")}</option>
                {STATUS_GPIO_PINS.map((pin) => (
                  <option key={pin} value={pin}>GPIO {pin}</option>
                ))}
              </select>
            </label>
            <ChoiceControl<StatusGpioMode>
              label={t("config.statusGpioMode")}
              value={draft.statusGpioMode}
              options={[
                { value: 0, label: t("config.statusGpioModes.0") },
                { value: 1, label: t("config.statusGpioModes.1") },
              ]}
              disabled={controlsDisabled || draft.statusGpioPin === STATUS_GPIO_DISABLED}
              onChange={(value) => bridge.setDraftField("statusGpioMode", value)}
            />
          </Section>
        </CardContent>
      </Card>
      <SwitchProgressDialog {...progress.dialogProps} />
      {usbReconnectPromptOpen && (
        <div className="usb-reconnect-toast" role="alert" data-no-drag>
          <div className="usb-reconnect-toast-copy">
            <strong>{t("config.usbReconnectPromptTitle")}</strong>
            <p>{t("config.usbReconnectPromptDescription")}</p>
          </div>
          <div className="usb-reconnect-toast-actions">
            <Button type="button" variant="ghost" onClick={closeUsbReconnectPrompt}>
              {t("config.usbReconnectPromptLater")}
            </Button>
            <Button
              type="button"
              onClick={() => {
                closeUsbReconnectPrompt();
                progress.start(t("config.switchingUsbSettings"), t("config.switchingUsbSettingsDescription"));
                void bridge.applyPendingUsbReconnect();
              }}
            >
              {t("config.usbReconnectPromptApply")}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

function Section({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children: ReactNode }) {
  return (
    <section className="config-section">
      <div className="config-section-heading">
        <span className="config-section-icon">{icon}</span>
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      </div>
      <div className="control-stack compact-stack">{children}</div>
    </section>
  );
}

function statusSuffix(t: (key: string) => string, active: boolean | null): string | undefined {
  if (active === null) {
    return undefined;
  }
  return t(active ? "config.audioActive" : "config.audioInactive");
}
