import { useState, useCallback, useRef, useEffect } from "react";

export type MLTrainingPhase =
  | "idle"
  | "resetting"
  | "baseline"
  | "baseline_wait"
  | "ml_learning"
  | "injection"
  | "stabilising"
  | "done";

export interface MLTrainingState {
  active: boolean;
  phase: MLTrainingPhase;
  /** Current baseline run (1-based) */
  baselineRun: number;
  /** Total baseline runs configured */
  baselineTotal: number;
  /** Seconds until next event (baseline wait or ML learning) */
  countdown: number;
  /** Whether the final anomaly injection batch has completed */
  injectionComplete: boolean;
}

export interface MLTrainingConfig {
  baselineRuns: number;
  baselineIntervalMin: number;
  mlWaitMin: number;
  stopDatafeedsOnComplete: boolean;
}

export const ML_TRAINING_DEFAULTS: MLTrainingConfig = {
  baselineRuns: 5,
  baselineIntervalMin: 15,
  mlWaitMin: 30,
  stopDatafeedsOnComplete: true,
};

/**
 * Orchestrates the full ML anomaly detection workflow:
 *   0. Reset ML jobs to clear stale model state from previous runs
 *   1. Ship N baseline batches (injectAnomalies = false), spaced by baselineIntervalMin
 *   2. Wait mlWaitMin for ML to learn the baseline
 *   3. Ship 1 anomaly injection batch (injectAnomalies = true)
 *   4. Wait a short stabilisation period then stop datafeeds to freeze anomaly scores
 */
export function useMLTrainingLoop(
  shipFn: (injectAnomalies: boolean) => Promise<void>,
  abortRef: { current: boolean },
  callbacks?: {
    onResetJobs?: () => Promise<void>;
    onStopDatafeeds?: () => Promise<void>;
  }
): {
  mlState: MLTrainingState;
  startMLTraining: (cfg: MLTrainingConfig) => Promise<void>;
  stopMLTraining: () => void;
  mlLoopRef: React.MutableRefObject<AbortController | null>;
} {
  const [active, setActive] = useState(false);
  const [phase, setPhase] = useState<MLTrainingPhase>("idle");
  const [baselineRun, setBaselineRun] = useState(0);
  const [baselineTotal, setBaselineTotal] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [injectionComplete, setInjectionComplete] = useState(false);

  const mlLoopRef = useRef<AbortController | null>(null);
  const shipRef = useRef(shipFn);
  shipRef.current = shipFn;
  const onResetRef = useRef(callbacks?.onResetJobs);
  onResetRef.current = callbacks?.onResetJobs;
  const onStopRef = useRef(callbacks?.onStopDatafeeds);
  onStopRef.current = callbacks?.onStopDatafeeds;
  const countdownTargetRef = useRef<Date | null>(null);

  useEffect(() => {
    if (!countdownTargetRef.current) {
      setCountdown(0);
      return;
    }
    const target = countdownTargetRef.current;
    const tick = () => setCountdown(Math.max(0, Math.ceil((target.getTime() - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [phase]);

  const waitWithAbort = useCallback(
    (ms: number, controller: AbortController): Promise<boolean> =>
      new Promise((resolve) => {
        if (controller.signal.aborted) {
          resolve(false);
          return;
        }
        const id = setTimeout(() => resolve(true), ms);
        controller.signal.addEventListener(
          "abort",
          () => {
            clearTimeout(id);
            resolve(false);
          },
          { once: true }
        );
      }),
    []
  );

  const startMLTraining = useCallback(
    async (cfg: MLTrainingConfig) => {
      mlLoopRef.current?.abort();
      const controller = new AbortController();
      mlLoopRef.current = controller;

      setActive(true);
      setInjectionComplete(false);
      setBaselineTotal(cfg.baselineRuns);
      setBaselineRun(0);

      // Phase 0: Reset ML jobs to clear stale model state
      if (onResetRef.current) {
        setPhase("resetting");
        countdownTargetRef.current = null;
        await onResetRef.current();
        if (controller.signal.aborted) {
          setActive(false);
          setPhase("idle");
          mlLoopRef.current = null;
          return;
        }
      }

      // Phase 1: Baseline runs
      for (let run = 1; run <= cfg.baselineRuns; run++) {
        if (controller.signal.aborted) break;

        setPhase("baseline");
        setBaselineRun(run);
        countdownTargetRef.current = null;
        setCountdown(0);

        abortRef.current = false;
        await shipRef.current(false);

        if (abortRef.current) controller.abort();
        if (controller.signal.aborted) break;

        // Wait between baseline runs (skip wait after the last baseline run)
        if (run < cfg.baselineRuns) {
          setPhase("baseline_wait");
          const waitMs = cfg.baselineIntervalMin * 60 * 1000;
          countdownTargetRef.current = new Date(Date.now() + waitMs);
          const ok = await waitWithAbort(waitMs, controller);
          countdownTargetRef.current = null;
          if (!ok) break;
        }
      }

      if (controller.signal.aborted) {
        setActive(false);
        setPhase("idle");
        countdownTargetRef.current = null;
        mlLoopRef.current = null;
        return;
      }

      // Phase 2: Wait for ML to learn
      setPhase("ml_learning");
      const mlWaitMs = cfg.mlWaitMin * 60 * 1000;
      countdownTargetRef.current = new Date(Date.now() + mlWaitMs);
      const mlOk = await waitWithAbort(mlWaitMs, controller);
      countdownTargetRef.current = null;

      if (!mlOk || controller.signal.aborted) {
        setActive(false);
        setPhase("idle");
        mlLoopRef.current = null;
        return;
      }

      // Phase 3: Anomaly injection
      setPhase("injection");
      abortRef.current = false;
      await shipRef.current(true);

      if (controller.signal.aborted) {
        setActive(false);
        setPhase("idle");
        mlLoopRef.current = null;
        return;
      }

      if (cfg.stopDatafeedsOnComplete) {
        // Phase 4: Stabilisation — wait 2 min for ML to score the anomalies,
        // then stop datafeeds to freeze the model and preserve anomaly scores.
        setPhase("stabilising");
        const stabiliseMs = 2 * 60 * 1000;
        countdownTargetRef.current = new Date(Date.now() + stabiliseMs);
        const stabOk = await waitWithAbort(stabiliseMs, controller);
        countdownTargetRef.current = null;

        if (stabOk && !controller.signal.aborted && onStopRef.current) {
          await onStopRef.current();
        }
      }

      setInjectionComplete(true);
      setPhase("done");
      setActive(false);
      countdownTargetRef.current = null;
      mlLoopRef.current = null;
    },
    [abortRef, waitWithAbort]
  );

  const stopMLTraining = useCallback(() => {
    abortRef.current = true;
    mlLoopRef.current?.abort();
  }, [abortRef]);

  return {
    mlState: {
      active,
      phase,
      baselineRun,
      baselineTotal,
      countdown,
      injectionComplete,
    },
    startMLTraining,
    stopMLTraining,
    mlLoopRef,
  };
}
