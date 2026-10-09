import { useEffect, useMemo, useState } from "react";
import { Link2, Link2Off, Save, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IntegerControl } from "@/components/config/IntegerControl";
import { NS_FFB_SIZE, type NsTriggerSlot, type TriggerSide } from "@/protocol/nsSettings";

// Effect kinds the editor understands; anything else is edited as raw bytes.
// Parameter layouts follow the firmware defaults (ds.daidr.me encoding).
const EFFECT_KINDS = [
  { mode: 0x00, key: "off", params: [] },
  { mode: 0x01, key: "resistance", params: ["start", "force"] },
  { mode: 0x02, key: "section", params: ["start", "end", "force"] },
  { mode: 0x06, key: "vibration", params: ["frequency", "force", "start"] },
] as const;

type EffectKey = (typeof EFFECT_KINDS)[number]["key"] | "raw";

const BUILT_IN_PRESETS: Array<{ key: string; effect: number[]; threshold: number }> = [
  { key: "normal", effect: [0x00, 0, 0, 0], threshold: 0 },
  { key: "click", effect: [0x02, 15, 100, 255], threshold: 100 },
  { key: "short", effect: [0x01, 40, 255, 0], threshold: 30 },
  { key: "auto", effect: [0x06, 10, 255, 20], threshold: 20 },
];

const PATTERN_STORAGE_KEY = "ns-trigger-patterns";

interface SavedPattern {
  name: string;
  slot: NsTriggerSlot;
}

interface TriggerSlotEditorProps {
  slot: NsTriggerSlot;
  disabled: boolean;
  onChange: (slot: NsTriggerSlot) => void;
}

export function TriggerSlotEditor({ slot, disabled, onChange }: TriggerSlotEditorProps) {
  const { t } = useTranslation();
  const linked = sidesEqual(slot);
  const [linkSides, setLinkSides] = useState(linked);
  const [side, setSide] = useState<TriggerSide>(1);
  const [patterns, setPatterns] = useState<SavedPattern[]>(readPatterns);
  const [patternName, setPatternName] = useState("");

  const effect = slot.effect[side];
  const kind = effectKind(effect);
  const effectHex = effect.map((value) => value.toString(16).padStart(2, "0")).join(" ");
  const [rawText, setRawText] = useState(effectHex);

  useEffect(() => setRawText(effectHex), [effectHex]);
  const kindInfo = EFFECT_KINDS.find((item) => item.key === kind);

  const update = (mutate: (next: NsTriggerSlot, s: TriggerSide) => void) => {
    const next = cloneSlot(slot);
    const sides: TriggerSide[] = linkSides ? [0, 1] : [side];
    sides.forEach((s) => mutate(next, s));
    onChange(next);
  };

  const setKind = (nextKind: EffectKey) => {
    if (nextKind === "raw") {
      return;
    }
    const info = EFFECT_KINDS.find((item) => item.key === nextKind)!;
    const preset = BUILT_IN_PRESETS.find((item) => item.effect[0] === info.mode);
    update((next, s) => {
      next.effect[s] = padEffect(preset ? preset.effect : [info.mode]);
    });
  };

  const presetButtons = useMemo(() => BUILT_IN_PRESETS, []);

  return (
    <div className="ns-trigger-editor">
      <div className="ns-editor-toolbar">
        <span className="ns-editor-label">{t("trigger.presets")}</span>
        {presetButtons.map((preset) => (
          <Button
            key={preset.key}
            type="button"
            size="sm"
            variant="secondary"
            disabled={disabled}
            onClick={() => update((next, s) => {
              next.effect[s] = padEffect(preset.effect);
              next.threshold[s] = preset.threshold;
            })}
          >
            {t(`trigger.presetNames.${preset.key}`)}
          </Button>
        ))}
      </div>

      <div className="ns-editor-toolbar">
        <Tabs value={String(side)} onValueChange={(next) => setSide(Number(next) as TriggerSide)}>
          <TabsList className="grid h-9 w-[180px] grid-cols-2">
            <TabsTrigger value="0" className="h-7 text-xs font-bold">L2</TabsTrigger>
            <TabsTrigger value="1" className="h-7 text-xs font-bold">R2</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button
          type="button"
          size="sm"
          variant={linkSides ? "secondary" : "outline"}
          disabled={disabled}
          onClick={() => {
            if (!linkSides) {
              // Linking copies the side being edited to the other one.
              const next = cloneSlot(slot);
              next.effect[side === 0 ? 1 : 0] = [...next.effect[side]];
              next.threshold[side === 0 ? 1 : 0] = next.threshold[side];
              onChange(next);
            }
            setLinkSides(!linkSides);
          }}
        >
          {linkSides ? <Link2 size={14} /> : <Link2Off size={14} />}
          {t(linkSides ? "trigger.linked" : "trigger.separate")}
        </Button>
      </div>

      <div className="control-row control-row-plain">
        <strong>{t("trigger.effect")}</strong>
        <Tabs value={kind} onValueChange={(next) => setKind(next as EffectKey)} className="w-full">
          <TabsList className="grid h-10 w-full grid-cols-5">
            {[...EFFECT_KINDS.map((item) => item.key), "raw" as const].map((key) => (
              <TabsTrigger key={key} value={key} disabled={disabled} className="h-8 text-xs font-bold">
                {t(`trigger.kinds.${key}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {kindInfo && kindInfo.params.map((param, index) => (
        <IntegerControl
          key={param}
          label={t(`trigger.params.${param}`)}
          value={effect[index + 1]}
          min={0}
          max={255}
          disabled={disabled}
          onChange={(value) => update((next, s) => {
            next.effect[s][index + 1] = value;
          })}
        />
      ))}

      {kind === "raw" || kindInfo === undefined ? null : (
        <p className="config-tip">{t(`trigger.kindHelp.${kind}`)}</p>
      )}

      <label className="control-row">
        <span>
          <strong>{t("trigger.rawBytes")}</strong>
          <em>{t("trigger.rawBytesDescription")}</em>
        </span>
        <Input
          className="font-mono text-xs"
          value={rawText}
          disabled={disabled}
          onChange={(event) => setRawText(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
          onBlur={() => {
            const bytes = parseHexBytes(rawText);
            if (!bytes) {
              setRawText(effectHex);
              return;
            }
            update((next, s) => {
              next.effect[s] = padEffect(bytes);
            });
          }}
        />
      </label>

      <IntegerControl
        label={t("trigger.threshold")}
        description={t("trigger.thresholdDescription")}
        value={slot.threshold[side]}
        min={0}
        max={255}
        disabled={disabled}
        onChange={(value) => update((next, s) => {
          next.threshold[s] = value;
        })}
      />

      <div className="ns-editor-toolbar">
        <span className="ns-editor-label">{t("trigger.patterns")}</span>
        <Input
          className="ns-pattern-name"
          placeholder={t("trigger.patternName")}
          value={patternName}
          onChange={(event) => setPatternName(event.currentTarget.value)}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!patternName.trim()}
          onClick={() => {
            const next = [...patterns.filter((item) => item.name !== patternName.trim()), { name: patternName.trim(), slot: cloneSlot(slot) }];
            setPatterns(next);
            writePatterns(next);
            setPatternName("");
          }}
        >
          <Save size={14} />
          {t("trigger.savePattern")}
        </Button>
      </div>
      {patterns.length > 0 && (
        <div className="ns-pattern-list">
          {patterns.map((pattern) => (
            <span key={pattern.name} className="ns-pattern-chip">
              <button type="button" disabled={disabled} onClick={() => onChange(cloneSlot(pattern.slot))}>
                {pattern.name}
              </button>
              <button
                type="button"
                aria-label={t("trigger.deletePattern")}
                onClick={() => {
                  const next = patterns.filter((item) => item.name !== pattern.name);
                  setPatterns(next);
                  writePatterns(next);
                }}
              >
                <Trash2 size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function effectKind(effect: number[]): EffectKey {
  const info = EFFECT_KINDS.find((item) => item.mode === effect[0]);
  if (!info) {
    return "raw";
  }
  // Bytes past the known parameters make it a custom effect.
  const extra = effect.slice(1 + info.params.length).some((value) => value !== 0);
  return extra ? "raw" : info.key;
}

function padEffect(bytes: number[]): number[] {
  const out = new Array<number>(NS_FFB_SIZE).fill(0);
  bytes.slice(0, NS_FFB_SIZE).forEach((value, index) => {
    out[index] = value & 0xff;
  });
  return out;
}

function cloneSlot(slot: NsTriggerSlot): NsTriggerSlot {
  return {
    effect: [[...slot.effect[0]], [...slot.effect[1]]],
    threshold: [slot.threshold[0], slot.threshold[1]],
  };
}

function sidesEqual(slot: NsTriggerSlot): boolean {
  return slot.threshold[0] === slot.threshold[1] && slot.effect[0].every((value, index) => value === slot.effect[1][index]);
}

function parseHexBytes(text: string): number[] | null {
  const parts = text.trim().split(/[\s,]+/).filter(Boolean);
  if (parts.length === 0 || parts.length > NS_FFB_SIZE || parts.some((part) => !/^[0-9a-f]{1,2}$/i.test(part))) {
    return null;
  }
  return parts.map((part) => Number.parseInt(part, 16));
}

// Saved patterns are a convenience of this PC (the dongle only keeps the 4 slots).
function readPatterns(): SavedPattern[] {
  try {
    const raw = localStorage.getItem(PATTERN_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as SavedPattern[]) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => item?.name && item.slot?.effect?.length === 2) : [];
  } catch {
    return [];
  }
}

function writePatterns(patterns: SavedPattern[]): void {
  try {
    localStorage.setItem(PATTERN_STORAGE_KEY, JSON.stringify(patterns));
  } catch {
    // The list still works for this session.
  }
}
