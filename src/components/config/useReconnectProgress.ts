import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { UseDs5BridgeResult } from "@/hooks/useDs5Bridge";

/** Progress animation length while the dongle re-enumerates (ms). */
export const PROGRESS_ANIMATION_DURATION_MS = 5000;
// A mode switch reboots the dongle, which takes longer than a USB reconnect.
const FALLBACK_FINISH_EXTRA_MS = 12_000;

export interface ReconnectProgressDialogProps {
  open: boolean;
  title: string;
  description: string;
  progress: number;
}

/**
 * Drives SwitchProgressDialog while the dongle drops off USB and comes back:
 * runs to 90% during the wait and completes once the hook reports a fresh attach.
 */
export function useReconnectProgress(bridge: UseDs5BridgeResult, onProgressComplete?: () => void) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [progress, setProgress] = useState(0);
  const progressValueRef = useRef(0);
  const progressFrameRef = useRef<number | null>(null);
  const timeoutIdsRef = useRef<number[]>([]);
  const runIdRef = useRef(0);
  const finishingRef = useRef(false);
  const startReadyTokenRef = useRef(bridge.switchReadyToken);
  const fallbackTimeoutRef = useRef<number | null>(null);
  const onProgressCompleteRef = useRef(onProgressComplete);

  onProgressCompleteRef.current = onProgressComplete;

  const setProgressValue = useCallback((value: number) => {
    const nextValue = Math.max(0, Math.min(100, value));
    progressValueRef.current = nextValue;
    setProgress(nextValue);
  }, []);

  const clearManagedTimeouts = useCallback(() => {
    timeoutIdsRef.current.forEach((id) => window.clearTimeout(id));
    timeoutIdsRef.current = [];
    if (fallbackTimeoutRef.current !== null) {
      window.clearTimeout(fallbackTimeoutRef.current);
      fallbackTimeoutRef.current = null;
    }
  }, []);

  const delay = useCallback((ms: number) => new Promise<void>((resolve) => {
    const id = window.setTimeout(() => {
      timeoutIdsRef.current = timeoutIdsRef.current.filter((timeoutId) => timeoutId !== id);
      resolve();
    }, ms);
    timeoutIdsRef.current.push(id);
  }), []);

  const stopAnimation = useCallback(() => {
    if (progressFrameRef.current !== null) {
      window.cancelAnimationFrame(progressFrameRef.current);
      progressFrameRef.current = null;
    }
  }, []);

  const animateTo = useCallback((to: number, durationMs: number, runId: number): Promise<void> => {
    stopAnimation();
    const from = progressValueRef.current;
    const startedAt = performance.now();

    return new Promise((resolve) => {
      const tick = (now: number) => {
        if (runIdRef.current !== runId) {
          progressFrameRef.current = null;
          resolve();
          return;
        }

        const ratio = durationMs <= 0 ? 1 : Math.min(1, (now - startedAt) / durationMs);
        setProgressValue(Math.max(progressValueRef.current, from + (to - from) * ratio));

        if (ratio >= 1) {
          progressFrameRef.current = null;
          resolve();
          return;
        }

        progressFrameRef.current = window.requestAnimationFrame(tick);
      };

      progressFrameRef.current = window.requestAnimationFrame(tick);
    });
  }, [setProgressValue, stopAnimation]);

  const finish = useCallback(async (runId: number) => {
    if (finishingRef.current || runIdRef.current !== runId) {
      return;
    }

    finishingRef.current = true;
    if (fallbackTimeoutRef.current !== null) {
      window.clearTimeout(fallbackTimeoutRef.current);
      fallbackTimeoutRef.current = null;
    }

    await animateTo(100, Math.max(300, (100 - progressValueRef.current) * 10), runId);
    if (runIdRef.current !== runId) {
      return;
    }

    setProgressValue(100);
    await delay(800);
    if (runIdRef.current !== runId) {
      return;
    }

    setOpen(false);
    await delay(250);
    if (runIdRef.current !== runId) {
      return;
    }

    setProgressValue(0);
    finishingRef.current = false;
    onProgressCompleteRef.current?.();
  }, [animateTo, delay, setProgressValue]);

  const start = useCallback((nextTitle: string, nextDescription: string) => {
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    finishingRef.current = false;
    startReadyTokenRef.current = bridge.switchReadyToken;

    clearManagedTimeouts();
    stopAnimation();

    flushSync(() => {
      setTitle(nextTitle);
      setDescription(nextDescription);
      setProgressValue(0);
      setOpen(true);
    });

    void animateTo(90, PROGRESS_ANIMATION_DURATION_MS, runId);
    fallbackTimeoutRef.current = window.setTimeout(() => {
      if (runIdRef.current === runId && !finishingRef.current) {
        void finish(runId);
      }
    }, PROGRESS_ANIMATION_DURATION_MS + FALLBACK_FINISH_EXTRA_MS);
  }, [animateTo, bridge.switchReadyToken, clearManagedTimeouts, finish, setProgressValue, stopAnimation]);

  /** Closes the dialog without waiting for a reconnect (the request failed). */
  const cancel = useCallback(() => {
    runIdRef.current += 1;
    clearManagedTimeouts();
    stopAnimation();
    finishingRef.current = false;
    setOpen(false);
    setProgressValue(0);
  }, [clearManagedTimeouts, setProgressValue, stopAnimation]);

  useEffect(() => {
    if (!open || bridge.switchReadyToken === startReadyTokenRef.current) {
      return;
    }

    void finish(runIdRef.current);
  }, [bridge.switchReadyToken, finish, open]);

  useEffect(() => () => {
    runIdRef.current += 1;
    clearManagedTimeouts();
    stopAnimation();
  }, [clearManagedTimeouts, stopAnimation]);

  const dialogProps: ReconnectProgressDialogProps = { open, title, description, progress };
  return { dialogProps, start, cancel };
}
