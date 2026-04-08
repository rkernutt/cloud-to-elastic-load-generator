/**
 * Synthetic metric documents aligned with the Elastic o365_metrics integration
 * @see https://www.elastic.co/docs/reference/integrations/o365_metrics
 */

import { rand, randInt } from "../../../azure/generators/helpers.js";
import type { EcsDocument } from "../../../aws/generators/types.js";

type MetricGenOut = EcsDocument[];

function reportDay(ts: string): string {
  return ts.slice(0, 10);
}

function countStr(n: number): string {
  return String(n);
}

export function generateActiveUsersServicesUserCounts(ts: string, er: number): MetricGenOut {
  const day = reportDay(ts);
  const exA = Math.random() < er ? randInt(0, 50) : randInt(200, 8000);
  const exI = randInt(0, 4000);
  return [
    {
      "@timestamp": ts,
      ecs: { version: "8.11.0" },
      o365: {
        metrics: {
          active: {
            users: {
              services: {
                user: {
                  counts: {
                    exchange: {
                      active: { count: countStr(exA) },
                      inactive: { count: countStr(exI) },
                    },
                    office365: {
                      active: { count: countStr(randInt(100, 9000)) },
                      inactive: { count: countStr(randInt(0, 5000)) },
                    },
                    onedrive: {
                      active: { count: countStr(randInt(50, 6000)) },
                      inactive: { count: countStr(randInt(0, 4500)) },
                    },
                    sharepoint: {
                      active: { count: countStr(randInt(40, 5000)) },
                      inactive: { count: countStr(randInt(0, 4000)) },
                    },
                    teams: {
                      active: { count: countStr(randInt(80, 7000)) },
                      inactive: { count: countStr(randInt(0, 3500)) },
                    },
                    yammer: {
                      active: { count: countStr(randInt(0, 800)) },
                      inactive: { count: countStr(randInt(0, 3000)) },
                    },
                    report: {
                      period: { day: rand(["7", "30", "90", "180"]) },
                      refresh_date: day,
                    },
                  },
                },
              },
            },
          },
        },
      },
      tags: ["o365.metrics.active.users.services.user.counts", "preserve_original_event"],
    },
  ];
}

export function generateTeamsUserActivityUserCounts(ts: string, er: number): MetricGenOut {
  const day = reportDay(ts);
  const z = () => (Math.random() < er ? randInt(0, 5) : randInt(10, 50_000));
  return [
    {
      "@timestamp": ts,
      ecs: { version: "8.11.0" },
      o365: {
        metrics: {
          teams: {
            user: {
              activity: {
                user: {
                  counts: {
                    calls: { count: z() },
                    meetings: { count: z() },
                    other_actions: { count: z() },
                    private_chat_messages: { count: z() },
                    team_chat_messages: { count: z() },
                    report: {
                      date: day,
                      period: { day: "7" },
                      refresh_date: day,
                    },
                  },
                },
              },
            },
          },
        },
      },
      tags: ["o365.metrics.teams.user.activity.user.counts", "preserve_original_event"],
    },
  ];
}

export function generateOutlookActivity(ts: string, er: number): MetricGenOut {
  const day = reportDay(ts);
  return [
    {
      "@timestamp": ts,
      ecs: { version: "8.11.0" },
      o365: {
        metrics: {
          outlook: {
            activity: {
              emails_received: {
                count: Math.random() < er ? randInt(0, 3) : randInt(20, 200_000),
              },
              meeting_created: { count: randInt(0, 5000) },
              report: {
                date: day,
                period: { day: "7" },
                refresh_date: day,
              },
            },
          },
        },
      },
      tags: ["o365.metrics.outlook.activity", "preserve_original_event"],
    },
  ];
}

export function generateOnedriveUsageStorage(ts: string, er: number): MetricGenOut {
  const day = reportDay(ts);
  const bytes = Math.random() < er ? randInt(1000, 1_000_000) : randInt(50_000_000, 12_000_000_000);
  return [
    {
      "@timestamp": ts,
      ecs: { version: "8.11.0" },
      o365: {
        metrics: {
          onedrive: {
            usage: {
              storage: {
                site_type: rand(["OneDrive", "All"]),
                report: {
                  date: day,
                  period: { day: "7" },
                  refresh_date: day,
                },
                used: { byte: bytes },
              },
            },
          },
        },
      },
      tags: ["o365.metrics.onedrive_usage_storage", "preserve_original_event"],
    },
  ];
}
