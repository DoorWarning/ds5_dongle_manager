import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Copy, LoaderCircle, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { UseDs5BridgeResult } from "@/hooks/useDs5Bridge";
import {
  STICK_CENTER,
  SWITCH_BUTTONS,
  neutralMacroEvent,
  type MacroEvent,
  type SwitchButtonKey,
} from "@/protocol/nsSettings";

export const SLOT_SYMBOLS = ["○", "✕", "△", "□"] as const;

const BUTTON_LABELS: Record<SwitchButtonKey, string> = {
  circle: "○",
  cross: "✕",
  triangle: "△",
  square: "□",
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
  l1: "L1",
  r1: "R1",
  l2: "L2",
  r2: "R2",
  l3: "L3",
  r3: "R3",
  create: "Create",
  options: "Options",
  ps: "PS",
  touchpad: "Pad",
};

interface MacroEditorProps {
  bridge: UseDs5BridgeResult;
  slot: number;
  onClose: () => void;
}

/** Step list editor for one macro slot: duration, buttons and both sticks per step. */
export function MacroEditor({ bridge, slot, onClose }: MacroEditorProps) {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState<MacroEvent[] | null>(null);
  const [events, setEvents] = useState<MacroEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [closeArmed, setCloseArmed] = useState(false);
  const maxEvents = bridge.macroInfo?.maxEvents ?? 340;
  const dirty = loaded !== null && JSON.stringify(loaded) !== JSON.stringify(events);
  const totalMs = useMemo(() => events.reduce((sum, event) => sum + event.durMs, 0), [events]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    bridge.readMacroSlot(slot)
      .then((read) => {
        if (!cancelled) {
          setLoaded(read);
          setEvents(read);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoaded([]);
          setEvents([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // Load once per slot; bridge functions are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot]);

  const updateEvent = (index: number, mutate: (event: MacroEvent) => MacroEvent) => {
    setCloseArmed(false);
    setEvents((current) => current.map((event, i) => (i === index ? mutate(event) : event)));
  };

  const insertAt = (index: number, event: MacroEvent) => {
    if (events.length >= maxEvents) {
      return;
    }
    setCloseArmed(false);
    setEvents((current) => [...current.slice(0, index), event, ...current.slice(index)]);
  };

  const removeAt = (index: number) => {
    setCloseArmed(false);
    setEvents((current) => current.filter((_, i) => i !== index));
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= events.length) {
      return;
    }
    setCloseArmed(false);
    setEvents((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const save = async (next: MacroEvent[]) => {
    setSaving(true);
    const ok = await bridge.writeMacroSlot(slot, next);
    setSaving(false);
    if (ok) {
      setLoaded(next);
      setEvents(next);
    }
  };

  const busy = loading || saving || !bridge.nsEditable;

  return (
    <section className="config-section ns-macro-editor">
      <div className="ns-macro-editor-head">
        <div>
          <h3>{t("macro.editorTitle", { slot: SLOT_SYMBOLS[slot] })}</h3>
          <p>
            {t("macro.summary", { count: events.length, max: maxEvents, seconds: (totalMs / 1000).toFixed(2) })}
            {dirty && <em className="ns-macro-dirty">{t("macro.unsaved")}</em>}
          </p>
        </div>
        <div className="ns-editor-toolbar">
          <Button type="button" size="sm" variant="secondary" disabled={busy || events.length >= maxEvents}
            onClick={() => insertAt(events.length, neutralMacroEvent())}>
            <Plus size={14} />{t("macro.addStep")}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={busy || !dirty}
            onClick={() => loaded && setEvents(loaded)}>
            <RotateCcw size={14} />{t("macro.revert")}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={busy || (loaded?.length ?? 0) === 0}
            onClick={() => void save([])}>
            <Trash2 size={14} />{t("macro.clearSlot")}
          </Button>
          <Button type="button" size="sm" disabled={busy || !dirty} onClick={() => void save(events)}>
            {saving ? <LoaderCircle size={14} className="animate-spin" /> : <Save size={14} />}
            {t("macro.save")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={closeArmed ? "destructive" : "ghost"}
            onClick={() => {
              if (dirty && !closeArmed) {
                setCloseArmed(true);
                return;
              }
              onClose();
            }}
          >
            <X size={14} />{t(closeArmed ? "macro.discardAndClose" : "macro.close")}
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="config-tip"><LoaderCircle size={14} className="inline animate-spin" /> {t("macro.loading")}</p>
      ) : events.length === 0 ? (
        <p className="config-tip">{t("macro.empty")}</p>
      ) : (
        <div className="ns-macro-table" role="table">
          <div className="ns-macro-row ns-macro-row-head" role="row">
            <span>#</span>
            <span>{t("macro.duration")}</span>
            <span>{t("macro.buttons")}</span>
            <span>{t("macro.leftStick")}</span>
            <span>{t("macro.rightStick")}</span>
            <span />
          </div>
          {events.map((event, index) => (
            <div key={index} className="ns-macro-row" role="row">
              <span className="ns-macro-index">{index + 1}</span>
              <Input
                type="number"
                min={1}
                max={60000}
                value={event.durMs}
                disabled={busy}
                className="ns-macro-number"
                onChange={(e) => {
                  const value = Number(e.currentTarget.value);
                  if (Number.isFinite(value)) {
                    updateEvent(index, (current) => ({ ...current, durMs: Math.min(60000, Math.max(1, Math.round(value))) }));
                  }
                }}
              />
              <div className="ns-macro-buttons">
                {SWITCH_BUTTONS.map((button) => {
                  const on = (event.buttons[button.byte] & button.bit) !== 0;
                  return (
                    <button
                      key={button.key}
                      type="button"
                      disabled={busy}
                      className={`ns-macro-button ${on ? "is-on" : ""}`}
                      onClick={() => updateEvent(index, (current) => {
                        const buttons: [number, number, number] = [...current.buttons];
                        buttons[button.byte] ^= button.bit;
                        return { ...current, buttons };
                      })}
                    >
                      {BUTTON_LABELS[button.key]}
                    </button>
                  );
                })}
              </div>
              <StickInput value={event.left} disabled={busy} onChange={(left) => updateEvent(index, (current) => ({ ...current, left }))} />
              <StickInput value={event.right} disabled={busy} onChange={(right) => updateEvent(index, (current) => ({ ...current, right }))} />
              <div className="ns-macro-actions">
                <Button type="button" size="icon" variant="ghost" disabled={busy || index === 0} aria-label={t("macro.moveUp")} onClick={() => move(index, -1)}>
                  <ArrowUp size={14} />
                </Button>
                <Button type="button" size="icon" variant="ghost" disabled={busy || index === events.length - 1} aria-label={t("macro.moveDown")} onClick={() => move(index, 1)}>
                  <ArrowDown size={14} />
                </Button>
                <Button type="button" size="icon" variant="ghost" disabled={busy || events.length >= maxEvents} aria-label={t("macro.duplicate")}
                  onClick={() => insertAt(index + 1, { ...event, buttons: [...event.buttons], left: { ...event.left }, right: { ...event.right } })}>
                  <Copy size={14} />
                </Button>
                <Button type="button" size="icon" variant="ghost" disabled={busy || events.length >= maxEvents} aria-label={t("macro.insertBelow")}
                  onClick={() => insertAt(index + 1, neutralMacroEvent())}>
                  <Plus size={14} />
                </Button>
                <Button type="button" size="icon" variant="ghost" disabled={busy} aria-label={t("macro.deleteStep")} onClick={() => removeAt(index)}>
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="config-tip">{t("macro.editorHelp")}</p>
    </section>
  );
}

/** Stick as -100..100 % per axis (up = +), stored as 12-bit 0-4095. */
function StickInput({ value, disabled, onChange }: {
  value: { x: number; y: number };
  disabled: boolean;
  onChange: (value: { x: number; y: number }) => void;
}) {
  const toPercent = (raw: number) => Math.round(((raw - STICK_CENTER) / 2047) * 100);
  const fromPercent = (pct: number) => Math.round(STICK_CENTER + (Math.min(100, Math.max(-100, pct)) / 100) * 2047);
  return (
    <div className="ns-macro-stick">
      {(["x", "y"] as const).map((axis) => (
        <Input
          key={axis}
          type="number"
          min={-100}
          max={100}
          value={toPercent(value[axis])}
          disabled={disabled}
          className="ns-macro-number"
          aria-label={axis.toUpperCase()}
          onChange={(e) => {
            const pct = Number(e.currentTarget.value);
            if (Number.isFinite(pct)) {
              onChange({ ...value, [axis]: fromPercent(pct) });
            }
          }}
        />
      ))}
    </div>
  );
}
