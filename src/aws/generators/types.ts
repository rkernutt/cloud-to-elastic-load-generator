/**
 * Shared generator typings for AWS (and re-used by GCP/Azure metric/trace helpers).
 */

/** A single ECS-shaped log or APM document returned by a log generator. */
export type EcsDocument = Record<string, unknown>;

/** Signature for all log generators: returns one document. */
export type LogGenerator = (ts: string, er: number) => EcsDocument;

/** Signature for metric generators: returns an array of per-dimension documents. */
export type MetricGenerator = (ts: string, er: number) => EcsDocument[];

/** Signature for trace generators: returns an array of APM documents (tx + spans). */
export type TraceGenerator = (ts: string, er: number) => EcsDocument[];
