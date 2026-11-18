import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { ClipboardCopy, ClipboardPaste, FileDown, FileUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MacroFileError, parseMacro, serializeMacro } from "@/protocol/macroFile";
import type { MacroEvent } from "@/protocol/nsSettings";

const FILE_FILTERS = [{ name: "DS5 Dongle macro", extensions: ["json"] }];
const SLOT_FILE_NAMES = ["circle", "cross", "triangle", "square"];

interface MacroTransferDialogProps {
  mode: "export" | "import" | null;
  slot: number;
  events: MacroEvent[];
  maxEvents: number;
  onImport: (events: MacroEvent[]) => void;
  onClose: () => void;
}

/** Export a slot as text (copy / save .json) or import one (paste / open .json). */
export function MacroTransferDialog({ mode, slot, events, maxEvents, onImport, onClose }: MacroTransferDialogProps) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    setMessage(null);
    setText(mode === "export" ? serializeMacro(events) : "");
    // Snapshot when the dialog opens; edits meanwhile are not expected.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const describeError = (cause: unknown): string => {
    if (cause instanceof MacroFileError) {
      return t(`macroFile.errors.${cause.code}`, cause.detail);
    }
    return cause instanceof Error ? cause.message : String(cause);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage({ kind: "ok", text: t("macroFile.copied") });
    } catch {
      setMessage({ kind: "error", text: t("macroFile.copyFailed") });
    }
  };

  const saveFile = async () => {
    try {
      const path = await saveDialog({ filters: FILE_FILTERS, defaultPath: `macro-${SLOT_FILE_NAMES[slot] ?? slot}.json` });
      if (!path) {
        return;
      }
      await invoke("ds5_write_text_file", { path, contents: text });
      setMessage({ kind: "ok", text: t("macroFile.saved", { path }) });
    } catch (cause) {
      setMessage({ kind: "error", text: describeError(cause) });
    }
  };

  const pasteClipboard = async () => {
    try {
      setText(await navigator.clipboard.readText());
      setMessage(null);
    } catch {
      setMessage({ kind: "error", text: t("macroFile.pasteFailed") });
    }
  };

  const openFile = async () => {
    try {
      const path = await openDialog({ filters: FILE_FILTERS, multiple: false, directory: false });
      if (typeof path !== "string") {
        return;
      }
      setText(await invoke<string>("ds5_read_text_file", { path }));
      setMessage(null);
    } catch (cause) {
      setMessage({ kind: "error", text: describeError(cause) });
    }
  };

  const apply = () => {
    try {
      const parsed = parseMacro(text, maxEvents);
      onImport(parsed);
      onClose();
    } catch (cause) {
      setMessage({ kind: "error", text: describeError(cause) });
    }
  };

  const exporting = mode === "export";

  return (
    <Dialog open={mode !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-2xl" data-no-drag>
        <DialogHeader>
          <DialogTitle>{t(exporting ? "macroFile.exportTitle" : "macroFile.importTitle")}</DialogTitle>
          <DialogDescription>{t(exporting ? "macroFile.exportDescription" : "macroFile.importDescription")}</DialogDescription>
        </DialogHeader>
        <textarea
          className="ns-macro-text"
          value={text}
          readOnly={exporting}
          spellCheck={false}
          placeholder={exporting ? undefined : t("macroFile.placeholder")}
          onChange={(event) => setText(event.currentTarget.value)}
        />
        {message && <p className={`ns-macro-text-message ${message.kind === "error" ? "is-error" : ""}`}>{message.text}</p>}
        <DialogFooter className="gap-2 sm:justify-between">
          {exporting ? (
            <>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={() => void copy()}>
                  <ClipboardCopy size={14} />{t("macroFile.copy")}
                </Button>
                <Button type="button" variant="secondary" onClick={() => void saveFile()}>
                  <FileDown size={14} />{t("macroFile.saveFile")}
                </Button>
              </div>
              <Button type="button" variant="ghost" onClick={onClose}>{t("macro.close")}</Button>
            </>
          ) : (
            <>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={() => void pasteClipboard()}>
                  <ClipboardPaste size={14} />{t("macroFile.paste")}
                </Button>
                <Button type="button" variant="secondary" onClick={() => void openFile()}>
                  <FileUp size={14} />{t("macroFile.openFile")}
                </Button>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={onClose}>{t("macro.close")}</Button>
                <Button type="button" disabled={!text.trim()} onClick={apply}>{t("macroFile.apply")}</Button>
              </div>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
