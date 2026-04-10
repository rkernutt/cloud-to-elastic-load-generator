import { useState, useCallback, useRef, useEffect } from "react";

type PersistedBetweenRuns = {
  v: 1;
  lsKey: string;
  kind: "between_runs";
  displayRun: number;
  nextIterationRun: number;
  totalRuns: number;
  intervalMin: number;
  nextRunAt: string;
};

function scheduleStorageKey(lsKey: string) {
  return `${lsKey}:scheduleV1`;
}

function clearSchedulePersistence(lsKey: string) {
  try {
    sessionStorage.removeItem(scheduleStorageKey(lsKey));
  } catch {
    /* ignore */
  }
}

function persistBetweenRuns(lsKey: string, body: Omit<PersistedBetweenRuns, "v" | "lsKey">) {
  const payload: PersistedBetweenRuns = { v: 1, lsKey, ...body };
  try {
    sessionStorage.setItem(scheduleStorageKey(lsKey), JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function useScheduleLoop(
  lsKey: string,
  scheduleTotalRuns: number,
  scheduleIntervalMin: number,
  ship: () => Promise<void>,
  abortRef: { current: boolean }
): {
  scheduleActive: boolean;
  scheduleCurrentRun: number;
  nextRunAt: Date | null;
  countdown: number;
  scheduleResumeNotice: string | null;
  startSchedule: () => Promise<void>;
  scheduleLoopRef: { current: AbortController | null };
} {
  const [scheduleActive, setScheduleActive] = useState(false);
  const [scheduleCurrentRun, setScheduleCurrentRun] = useState(0);
  const [nextRunAt, setNextRunAt] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [scheduleResumeNotice, setScheduleResumeNotice] = useState<string | null>(null);

  const scheduleLoopRef = useRef<AbortController | null>(null);
  const shipRef = useRef(ship);
  shipRef.current = ship;

  const totalRunsRef = useRef(scheduleTotalRuns);
  totalRunsRef.current = scheduleTotalRuns;
  const intervalMinRef = useRef(scheduleIntervalMin);
  intervalMinRef.current = scheduleIntervalMin;

  useEffect(() => {
    if (!nextRunAt) {
      setCountdown(0);
      return;
    }
    const tick = () =>
      setCountdown(Math.max(0, Math.ceil((nextRunAt.getTime() - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [nextRunAt]);

  useEffect(() => {
    if (!scheduleResumeNotice) return;
    const t = setTimeout(() => setScheduleResumeNotice(null), 14000);
    return () => clearTimeout(t);
  }, [scheduleResumeNotice]);

  const runScheduleFrom = useCallback(
    async (firstRun: number, controller: AbortController) => {
      const total = totalRunsRef.current;
      const intervalMin = intervalMinRef.current;
      for (let run = firstRun; run <= total; run++) {
        if (controller.signal.aborted) break;
        setScheduleCurrentRun(run);
        setNextRunAt(null);
        clearSchedulePersistence(lsKey);
        await shipRef.current();
        if (abortRef.current) controller.abort();
        if (controller.signal.aborted || run === total) break;

        const nextTime = new Date(Date.now() + intervalMin * 60 * 1000);
        setNextRunAt(nextTime);
        persistBetweenRuns(lsKey, {
          kind: "between_runs",
          displayRun: run,
          nextIterationRun: run + 1,
          totalRuns: total,
          intervalMin,
          nextRunAt: nextTime.toISOString(),
        });

        await new Promise<void>((resolve) => {
          const id = setTimeout(resolve, intervalMin * 60 * 1000);
          controller.signal.addEventListener(
            "abort",
            () => {
              clearTimeout(id);
              resolve();
            },
            { once: true }
          );
        });
        clearSchedulePersistence(lsKey);
      }

      scheduleLoopRef.current = null;
      setScheduleActive(false);
      setScheduleCurrentRun(0);
      setNextRunAt(null);
      clearSchedulePersistence(lsKey);
    },
    [lsKey, abortRef]
  );

  const startSchedule = useCallback(async () => {
    scheduleLoopRef.current?.abort();
    const controller = new AbortController();
    scheduleLoopRef.current = controller;
    setScheduleActive(true);
    clearSchedulePersistence(lsKey);
    await runScheduleFrom(1, controller);
  }, [lsKey, runScheduleFrom]);

  useEffect(() => {
    let cancelled = false;
    const raw = sessionStorage.getItem(scheduleStorageKey(lsKey));
    if (!raw) return;

    let parsed: PersistedBetweenRuns;
    try {
      parsed = JSON.parse(raw) as PersistedBetweenRuns;
    } catch {
      clearSchedulePersistence(lsKey);
      return;
    }
    if (parsed.v !== 1 || parsed.lsKey !== lsKey || parsed.kind !== "between_runs") {
      clearSchedulePersistence(lsKey);
      return;
    }

    const next = new Date(parsed.nextRunAt);
    if (Number.isNaN(next.getTime())) {
      clearSchedulePersistence(lsKey);
      return;
    }

    const now = Date.now();
    if (next.getTime() <= now) {
      clearSchedulePersistence(lsKey);
      setScheduleResumeNotice(
        "A schedule was interrupted by a page refresh. The pause between runs had already ended — start the schedule again if you still need it."
      );
      return;
    }

    sessionStorage.removeItem(scheduleStorageKey(lsKey));

    const controller = new AbortController();
    scheduleLoopRef.current = controller;
    totalRunsRef.current = parsed.totalRuns;
    intervalMinRef.current = parsed.intervalMin;

    setScheduleResumeNotice(
      "Schedule countdown was restored after a page refresh. The next run starts when the timer reaches zero."
    );
    setScheduleActive(true);
    setScheduleCurrentRun(parsed.displayRun);
    setNextRunAt(next);

    void (async () => {
      const waitMs = next.getTime() - now;
      await new Promise<void>((resolve) => {
        const id = setTimeout(resolve, waitMs);
        controller.signal.addEventListener(
          "abort",
          () => {
            clearTimeout(id);
            resolve();
          },
          { once: true }
        );
      });
      if (cancelled || controller.signal.aborted) return;

      clearSchedulePersistence(lsKey);
      setNextRunAt(null);
      await runScheduleFrom(parsed.nextIterationRun, controller);
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [lsKey, runScheduleFrom]);

  return {
    scheduleActive,
    scheduleCurrentRun,
    nextRunAt,
    countdown,
    scheduleResumeNotice,
    startSchedule,
    scheduleLoopRef,
  };
}
