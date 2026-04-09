import type { DashboardDef } from "./types";

export function stableDashboardKey(d: DashboardDef, index: number): string {
  return d.title?.trim() ? d.title : `dashboard-${index}`;
}
