import { memo, type KeyboardEvent } from "react";
import { Gamepad2, Radio } from "lucide-react";
import {
  MdBattery0Bar,
  MdBattery1Bar,
  MdBattery2Bar,
  MdBattery3Bar,
  MdBattery4Bar,
  MdBattery5Bar,
  MdBattery6Bar,
  MdBatteryFull,
} from "react-icons/md";
import { useTranslation } from "react-i18next";
import { Tooltip } from "react-tooltip";
import { Card, CardContent } from "@/components/ui/card";
import { getControllerIconSrc } from "@/protocol/ds5BridgeHid";
import type { DongleMode } from "@/hooks/useDs5Bridge";

interface DeviceStripProps {
  client: { device: HIDDevice } | null;
  dongleMode: DongleMode | null;
  ds5Connected: boolean;
  batteryText: string;
  firmwareVersion: string;
  signalStrength: string;
  supported: boolean;
  onOpenSettings: () => void;
}

export const DeviceStrip = memo(function DeviceStrip({
  client,
  dongleMode,
  ds5Connected,
  batteryText,
  firmwareVersion,
  signalStrength,
  supported,
  onOpenSettings,
}: DeviceStripProps) {
  const { t } = useTranslation();

  const openFromKeyboard = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    onOpenSettings();
  };

  return (
    <section className="device-stage" aria-label={t("device.label")}>
      <div className="device-card-grid">
        {client && dongleMode ? (
          <Card
            className={`device-strip-card device-source-card connected is-clickable is-input-active ${ds5Connected ? "is-source-connected" : "is-source-disconnected"}`}
            role="button"
            tabIndex={0}
            onClick={onOpenSettings}
            onKeyDown={openFromKeyboard}
          >
            <CardContent className="device-strip">
              <div className="device-preview" aria-hidden="true">
                <div className="device-hero connected-device-hero">
                  <img src={getControllerIconSrc(client.device)} alt="" aria-hidden="true" draggable={false} />
                </div>
              </div>
              <div className="device-info-panel device-source-info-panel">
                <div className="device-source-heading">
                  <strong>
                    <span>{t("device.dongleName")}</span>
                  </strong>
                </div>
                <div className="device-status-icons">
                  <span
                    className="device-meta-chip"
                    data-tooltip-id="device-info-tooltip"
                    data-tooltip-content={t(`mode.descriptions.${dongleMode}`)}
                    data-tooltip-place="top"
                  >
                    {t(`mode.names.${dongleMode}`)}
                  </span>
                  <span
                    className="device-meta-chip"
                    data-tooltip-id="device-info-tooltip"
                    data-tooltip-content={t("device.firmwareVersion", { version: firmwareVersion })}
                    data-tooltip-place="top"
                  >
                    {firmwareVersion}
                  </span>
                  {ds5Connected ? (
                    <span
                      className="device-battery"
                      data-battery-level={batteryLevelState(batteryText)}
                      data-tooltip-id="device-info-tooltip"
                      data-tooltip-content={t("device.battery", { battery: batteryText })}
                      data-tooltip-place="top"
                    >
                      <BatteryIcon batteryText={batteryText} />
                      <span>{batteryText}</span>
                    </span>
                  ) : (
                    <span className="device-meta-chip">{t("device.ds5Disconnected")}</span>
                  )}
                  {dongleMode === "pc" && ds5Connected && signalStrength !== "--" && (
                    <span
                      className="device-signal"
                      data-tooltip-id="device-info-tooltip"
                      data-tooltip-content={t("device.signalStrength", { signal: signalStrength })}
                      data-tooltip-place="top"
                    >
                      <Radio size={14} aria-hidden="true" />
                      <span>{signalStrength}</span>
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="device-empty-layout" role="status" aria-live="polite">
            <Card className="device-empty-card">
              <CardContent className="device-empty-content">
                <div className="device-empty-icon" aria-hidden="true">
                  <Gamepad2 size={54} />
                </div>
                <strong>{t("device.waitingTitle")}</strong>
                <p>{t("device.waitingHint")}</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
      {!supported && <p className="device-hint">{t("notice.webHidUnsupported")}</p>}
      <Tooltip id="device-info-tooltip" place="top" positionStrategy="fixed" />
    </section>
  );
});

function BatteryIcon({ batteryText }: { batteryText: string }) {
  const level = batteryLevelFromText(batteryText);
  const iconProps = { size: 22, className: "device-battery-icon", focusable: false } as const;

  if (level === null || level < 12) {
    return <MdBattery0Bar {...iconProps} />;
  }
  if (level >= 95) {
    return <MdBatteryFull {...iconProps} />;
  }
  if (level >= 82) {
    return <MdBattery6Bar {...iconProps} />;
  }
  if (level >= 68) {
    return <MdBattery5Bar {...iconProps} />;
  }
  if (level >= 54) {
    return <MdBattery4Bar {...iconProps} />;
  }
  if (level >= 40) {
    return <MdBattery3Bar {...iconProps} />;
  }
  if (level >= 26) {
    return <MdBattery2Bar {...iconProps} />;
  }
  return <MdBattery1Bar {...iconProps} />;
}

function batteryLevelFromText(text: string): number | null {
  const match = text.match(/\d+/);
  const value = match ? Number.parseInt(match[0], 10) : Number.NaN;
  return Number.isNaN(value) ? null : Math.min(Math.max(value, 0), 100);
}

function batteryLevelState(text: string): "unknown" | "low" | "medium" | "high" {
  const level = batteryLevelFromText(text);
  if (level === null) {
    return "unknown";
  }
  if (level <= 20) {
    return "low";
  }
  return level <= 60 ? "medium" : "high";
}
