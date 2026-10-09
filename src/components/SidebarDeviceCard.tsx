import { BatteryFull, CircleAlert, CircleArrowUp, Gamepad2, LoaderCircle, Radio } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getControllerIconSrc } from "@/protocol/ds5BridgeHid";
import type { DongleMode } from "@/hooks/useDs5Bridge";

interface SidebarDeviceCardProps {
  connectedDevice: HIDDevice | null;
  dongleMode: DongleMode | null;
  ds5Connected: boolean;
  batteryText: string;
  firmwareVersion: string;
  signalStrength: string;
  firmwareUpdateAvailable?: boolean;
  firmwareUpdateVersion?: string;
  onFirmwareUpdateClick?: () => void;
}

export function SidebarDeviceCard({
  connectedDevice,
  dongleMode,
  ds5Connected,
  batteryText,
  firmwareVersion,
  signalStrength,
  firmwareUpdateAvailable = false,
  firmwareUpdateVersion,
  onFirmwareUpdateClick,
}: SidebarDeviceCardProps) {
  const { t } = useTranslation();
  const displayFirmwareVersion = firmwareVersion.trim() || "--";
  const displaySignalStrength = signalStrength.trim() || "--";

  return (
    <div className="settings-device-card-trigger">
      <span className="settings-device-card-icon" aria-hidden="true">
        <img src={getControllerIconSrc(connectedDevice)} alt="" draggable={false} />
      </span>
      <span className="settings-device-card-copy">
        <span className="settings-device-card-title-row">
          <strong>{t("device.dongleName")}</strong>
          {dongleMode && <em className="settings-device-card-page-badge">{t(`mode.names.${dongleMode}`)}</em>}
        </span>
        <span className="settings-device-card-meta">
          <span>
            <Gamepad2 size={15} aria-hidden="true" />
            <em>{t(ds5Connected ? "device.ds5Connected" : "device.ds5Disconnected")}</em>
          </span>
          {ds5Connected && (
            <span>
              <BatteryFull size={15} aria-hidden="true" />
              <em>{t("device.battery", { battery: batteryText })}</em>
            </span>
          )}
          {dongleMode === "pc" && ds5Connected && (
            <span>
              <Radio size={15} aria-hidden="true" />
              <em>{t("device.signalStrength", { signal: displaySignalStrength })}</em>
            </span>
          )}
          <span>
            {displayFirmwareVersion === "--"
              ? <LoaderCircle className="settings-device-card-loading-icon" size={15} aria-hidden="true" />
              : <CircleAlert size={15} aria-hidden="true" />}
            <em>{t("device.firmwareVersion", { version: displayFirmwareVersion })}</em>
            {firmwareUpdateAvailable && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="settings-device-card-update"
                      aria-label={t("device.firmwareUpdateAvailable", { version: firmwareUpdateVersion })}
                      onClick={() => onFirmwareUpdateClick?.()}
                    >
                      <CircleArrowUp size={16} strokeWidth={2.4} aria-hidden="true" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8}>
                    {t("device.firmwareUpdateAvailable", { version: firmwareUpdateVersion })}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </span>
        </span>
      </span>
    </div>
  );
}
