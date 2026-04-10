import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { CloudAppConfig } from "../cloud/types";

/** Generator / enrich output — intentionally loose (ECS-shaped JSON). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ECS docs are dynamic per service
export type LooseDoc = Record<string, any>;

export type ShipStatus = "running" | "done" | "aborted" | null;
export type ShipProgressPhase = "main" | "injection";
export type ShipProgress = {
  sent: number;
  total: number;
  errors: number;
  phase: ShipProgressPhase;
};

export type EnrichDocFn = (
  doc: LooseDoc,
  svc: string,
  source: string,
  evType: string | "logs" | "metrics" | "traces"
) => LooseDoc;

export type RunShipWorkloadDeps = {
  config: CloudAppConfig;
  isTracesMode: boolean;
  selectedServices: string[];
  selectedTraceServices: string[];
  tracesPerService: number;
  logsPerService: number;
  errorRate: number;
  batchSize: number;
  batchDelayMs: number;
  elasticUrl: string;
  apiKey: string;
  indexPrefix: string;
  eventType: "logs" | "metrics" | "traces";
  traceIngestionSource: string;
  dryRun: boolean;
  injectAnomalies: boolean;
  enrichDoc: EnrichDocFn;
  getEffectiveSource: (svcId: string) => string;
  getIngestionClampDetail: (svcId: string) => { source: string; clampedFrom?: string | null };
  runConnectionValidation: () => boolean;
  abortRef: MutableRefObject<boolean>;
  addLog: (msg: string, type?: string) => void;
  setStatus: Dispatch<SetStateAction<ShipStatus>>;
  setLog: Dispatch<SetStateAction<{ id: number; msg: string; type: string; ts: string }[]>>;
  setProgress: Dispatch<SetStateAction<ShipProgress>>;
};
