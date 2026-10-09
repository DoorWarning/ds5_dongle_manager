import { Gamepad2, Keyboard, Power } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import type { UseDs5BridgeResult } from "@/hooks/useDs5Bridge";
import { DongleModeSection } from "./config/DongleModeSection";

interface NsPanelProps {
  bridge: UseDs5BridgeResult;
  onProgressComplete?: () => void;
}

const SHORTCUT_KEYS = ["vibration", "trigger", "macroRecord", "macroPlay", "macroLoop", "macroStop", "modeToggle"] as const;

/**
 * NS (Switch Pro) mode page. Vibration, trigger and macro settings are still changed with
 * controller shortcuts; the editable versions land with the NS settings v2 firmware.
 */
export function NsPanel({ bridge, onProgressComplete }: NsPanelProps) {
  const { t } = useTranslation();
  const info = bridge.dongleInfo;
  const inNsMode = bridge.dongleMode === "ns";

  return (
    <Card className="panel config-panel">
      <CardContent className="config-sections p-0">
        <DongleModeSection bridge={bridge} onProgressComplete={onProgressComplete} />

        {!inNsMode && <div className="config-tip">{t("ns.pcModeNotice")}</div>}

        <Section icon={<Gamepad2 size={17} />} title={t("ns.sections.status")} description={t("ns.sections.statusDescription")}>
          <StatusRow label={t("ns.ds5")} value={inNsMode ? t(bridge.ds5Connected ? "ns.connected" : "ns.disconnected") : "--"} />
          <StatusRow label={t("ns.battery")} value={inNsMode ? bridge.batteryText : "--"} />
          <StatusRow
            label={t("ns.wakeBeacon")}
            value={info ? t(info.wakeBeaconLearned ? "ns.wakeLearned" : "ns.wakeNotLearned") : "--"}
          />
        </Section>

        <Section icon={<Keyboard size={17} />} title={t("ns.sections.shortcuts")} description={t("ns.sections.shortcutsDescription")}>
          {SHORTCUT_KEYS.map((key) => (
            <StatusRow key={key} label={t(`ns.shortcuts.${key}.combo`)} value={t(`ns.shortcuts.${key}.action`)} />
          ))}
          <div className="config-tip">{t("ns.triggerModes")}</div>
        </Section>

        <Section icon={<Power size={17} />} title={t("ns.sections.wake")} description={t("ns.sections.wakeDescription")}>
          <div className="config-tip">{t("ns.wakeHelp")}</div>
        </Section>
      </CardContent>
    </Card>
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

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="control-row toggle-row">
      <span>
        <strong>{label}</strong>
      </span>
      <span className="justify-self-end text-sm font-bold">{value}</span>
    </div>
  );
}
