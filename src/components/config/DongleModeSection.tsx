import { ArrowLeftRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DongleMode, UseDs5BridgeResult } from "@/hooks/useDs5Bridge";
import { SwitchProgressDialog } from "./SwitchProgressDialog";
import { useReconnectProgress } from "./useReconnectProgress";

interface DongleModeSectionProps {
  bridge: UseDs5BridgeResult;
  onProgressComplete?: () => void;
}

/** PC (DualSense) <-> NS (Pro Controller) switch, shared by both settings pages. */
export function DongleModeSection({ bridge, onProgressComplete }: DongleModeSectionProps) {
  const { t } = useTranslation();
  const progress = useReconnectProgress(bridge, onProgressComplete);
  const currentMode = bridge.dongleMode;
  const companionReady = bridge.dongleInfo !== null;
  const disabled = !currentMode || !companionReady || bridge.operation !== null;

  const handleSwitch = async (target: DongleMode) => {
    if (disabled || target === currentMode) {
      return;
    }

    progress.start(
      t(target === "ns" ? "mode.switchingToNs" : "mode.switchingToPc"),
      t("mode.switchingDescription"),
    );
    const accepted = await bridge.switchDongleMode(target);
    if (!accepted) {
      progress.cancel();
    }
  };

  return (
    <section className="config-section config-section-featured">
      <div className="config-section-heading">
        <span className="config-section-icon">
          <ArrowLeftRight size={17} />
        </span>
        <div>
          <h3>{t("mode.title")}</h3>
          <p>{t("mode.description")}</p>
        </div>
      </div>
      <div className="control-stack compact-stack">
        <div className={`control-row control-row-plain ${disabled ? "is-disabled" : ""}`}>
          <strong>{t("mode.current", { mode: currentMode ? t(`mode.names.${currentMode}`) : "--" })}</strong>
          <em>{companionReady ? t("mode.switchHint") : t("mode.companionMissing")}</em>
          <Tabs value={currentMode ?? ""} onValueChange={(next) => void handleSwitch(next as DongleMode)} className="w-full">
            <TabsList className="grid h-10 w-full grid-cols-2">
              <TabsTrigger value="pc" disabled={disabled} className="h-8 text-sm font-bold">
                {t("mode.names.pc")}
              </TabsTrigger>
              <TabsTrigger value="ns" disabled={disabled} className="h-8 text-sm font-bold">
                {t("mode.names.ns")}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        {currentMode && companionReady && (
          <div className="control-row control-row-action">
            <span>
              <strong>{t(currentMode === "pc" ? "mode.switchToNs" : "mode.switchToPc")}</strong>
              <small>{t("mode.rebootNote")}</small>
            </span>
            <Button
              type="button"
              variant="secondary"
              disabled={disabled}
              onClick={() => void handleSwitch(currentMode === "pc" ? "ns" : "pc")}
            >
              {t("mode.switchNow")}
            </Button>
          </div>
        )}
      </div>
      <SwitchProgressDialog {...progress.dialogProps} />
    </section>
  );
}
