/**
 * Persist setup / ship activity logs in sessionStorage so a tab close or refresh
 * does not erase in-progress install output or shipping history.
 */

const SETUP_V = 1 as const;
const ACTIVITY_V = 1 as const;

export const MAX_SETUP_LOG_ENTRIES = 4000;
export const MAX_ACTIVITY_LOG_ENTRIES = 5000;

export type SetupLogLineType = "info" | "ok" | "error" | "warn";

export interface SetupLogEntryPersisted {
  text: string;
  type: SetupLogLineType;
  at: string;
}

export interface SetupLogSnapshot {
  v: typeof SETUP_V;
  installRunActive: boolean;
  entries: SetupLogEntryPersisted[];
}

export interface ActivityLogEntryPersisted {
  id: number;
  msg: string;
  type: string;
  ts: string;
  at: string;
}

export interface ActivityLogSnapshot {
  v: typeof ACTIVITY_V;
  entries: ActivityLogEntryPersisted[];
}

function safeParse<T>(raw: string | null): T | null {
  if (raw == null || raw === "") return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function loadSetupLog(key: string | undefined): SetupLogSnapshot | null {
  if (!key) return null;
  try {
    const data = safeParse<SetupLogSnapshot>(sessionStorage.getItem(key));
    if (!data || data.v !== SETUP_V || !Array.isArray(data.entries)) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveSetupLog(key: string | undefined, snapshot: SetupLogSnapshot): void {
  if (!key) return;
  try {
    const capped = {
      ...snapshot,
      entries: snapshot.entries.slice(-MAX_SETUP_LOG_ENTRIES),
    };
    sessionStorage.setItem(key, JSON.stringify(capped));
  } catch {
    /* quota / private mode */
  }
}

export function clearSetupLog(key: string | undefined): void {
  if (!key) return;
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function loadActivityLog(key: string | undefined): ActivityLogSnapshot | null {
  if (!key) return null;
  try {
    const data = safeParse<ActivityLogSnapshot>(sessionStorage.getItem(key));
    if (!data || data.v !== ACTIVITY_V || !Array.isArray(data.entries)) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveActivityLog(key: string | undefined, snapshot: ActivityLogSnapshot): void {
  if (!key) return;
  try {
    const capped = {
      ...snapshot,
      entries: snapshot.entries.slice(-MAX_ACTIVITY_LOG_ENTRIES),
    };
    sessionStorage.setItem(key, JSON.stringify(capped));
  } catch {
    /* ignore */
  }
}

export function clearActivityLog(key: string | undefined): void {
  if (!key) return;
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
