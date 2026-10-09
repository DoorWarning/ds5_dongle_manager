import { useState, type ReactNode } from "react";
import { Crosshair, Gamepad2, Keyboard, ListVideo, Power, Repeat, Vibrate } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { UseDs5BridgeResult } from "@/hooks/useDs5Bridge";
import {
  MACRO_SLOTS,
  NS_TRIGGER_SLOTS,
  TURBO_BUTTONS,
  TURBO_RATE_MAX,
  TURBO_RATE_MIN,
  type NsSettings,
} from "@/protocol/nsSettings";
import { DongleModeSection } from "./config/DongleModeSection";
import { IntegerControl } from "./config/IntegerControl";
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

const SHORTCUT_KEYS = ["vibration", "trigger", "turboOn", "turboOff", "macroRecord", "macroPlay", "macroLoop", "macroStop", "modeToggle"] as const;

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
  const [editSlot, setEditSlot] = useState<number | null>(null);
  const [triggerSlot, setTriggerSlot] = useState<number | null>(null);
  const shownTriggerSlot = triggerSlot ?? (draft ? draft.triggerMode - 1 : 0);

  const learning = Boolean(info?.wakeLearning);
  const wakeDisabled = !info || bridge.operation !== null;
  const wakeStatus = !info
    ? "--"
    : t(learning ? "ns.wakeLearningNow" : info.wakeBeaconLearned ? "ns.wakeLearned" : "ns.wakeNotLearned");

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
    <Card className="panel config-panel">
      <CardContent className="config-sections p-0">
        <DongleModeSection bridge={bridge} onProgressComplete={onProgressComplete} />

        {!inNsMode && <div className="config-tip">{t("ns.pcModeNotice")}</div>}
        {inNsMode && !bridge.nsEditable && info && <div className="config-tip">{t("ns.firmwareTooOld")}</div>}
        {editable && <div className="config-tip">{t(`ns.saveState.${bridge.nsSaveState}`)}</div>}

        <Section icon={<Gamepad2 size={17} />} title={t("ns.sections.status")} description={t("ns.sections.statusDescription")}>
          <StatusRow label={t("ns.ds5")} value={inNsMode ? t(bridge.ds5Connected ? "ns.connected" : "ns.disconnected") : "--"} />
          <StatusRow label={t("ns.battery")} value={inNsMode ? bridge.batteryText : "--"} />
        </Section>

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
                    className={`ns-macro-button ${on ? "is-on" : ""}`}
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

        <Section icon={<Crosshair size={17} />} title={t("ns.sections.trigger")} description={t("ns.sections.triggerDescription")}>
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
          {draft && (
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
          )}
        </Section>

        <Section icon={<ListVideo size={17} />} title={t("ns.sections.macro")} description={t("ns.sections.macroDescription")}>
          {Array.from({ length: MACRO_SLOTS }, (_, slot) => {
            const count = bridge.macroInfo?.counts[slot] ?? 0;
            const playing = bridge.macroInfo?.activeSlot === slot ? bridge.macroInfo.status : null;
            return (
              <div key={slot} className={`control-row control-row-action ${!editable ? "is-disabled" : ""}`}>
                <span>
                  <strong>{t("macro.slot", { slot: SLOT_SYMBOLS[slot] })}</strong>
                  <small>
                    {count > 0 ? t("macro.slotSteps", { count }) : t("macro.slotEmpty")}
                    {playing && playing !== "idle" ? ` · ${t(`macro.status.${playing}`)}` : ""}
                  </small>
                </span>
                <Button type="button" variant="secondary" disabled={!editable} onClick={() => setEditSlot(slot)}>
                  {t(count > 0 ? "macro.edit" : "macro.create")}
                </Button>
              </div>
            );
          })}
        </Section>

        <Section icon={<Keyboard size={17} />} title={t("ns.sections.shortcuts")} description={t("ns.sections.shortcutsDescription")}>
          {SHORTCUT_KEYS.map((key) => (
            <StatusRow key={key} label={t(`ns.shortcuts.${key}.combo`)} value={t(`ns.shortcuts.${key}.action`)} />
          ))}
        </Section>

        <Section icon={<Power size={17} />} title={t("ns.sections.wake")} description={t("ns.sections.wakeDescription")}>
          <StatusRow label={t("ns.wakeBeacon")} value={wakeStatus} />
          <div className={`control-row control-row-action ${wakeDisabled ? "is-disabled" : ""}`}>
            <span>
              <strong>{t(learning ? "ns.wakeLearningTitle" : "ns.wakeLearnTitle")}</strong>
              <small>{t(learning ? "ns.wakeLearningSteps" : "ns.wakeLearnDescription")}</small>
            </span>
            <Button
              type="button"
              variant={learning ? "outline" : "secondary"}
              disabled={wakeDisabled}
              onClick={() => void bridge.setWakeLearning(!learning)}
            >
              {t(learning ? "ns.wakeLearnCancel" : "ns.wakeLearnStart")}
            </Button>
          </div>
          <div className={`control-row control-row-action ${wakeDisabled || !info?.wakeBeaconLearned ? "is-disabled" : ""}`}>
            <span>
              <strong>{t("ns.wakeForgetTitle")}</strong>
              <small>{t("ns.wakeForgetDescription")}</small>
            </span>
            <Button
              type="button"
              variant="outline"
              disabled={wakeDisabled || !info?.wakeBeaconLearned}
              onClick={() => void bridge.forgetWakeBeacon()}
            >
              {t("ns.wakeForget")}
            </Button>
          </div>
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
