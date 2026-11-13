/**
 * Shared Rubrik sample pools for webhook / GraphQL / syslog generators.
 * Names and shapes align with rubrik-elastic-ingest ECS mapping + pipelines.
 */

import { rand, randUUID } from "../../helpers/index.js";

export const RUBRIK_TENANT_HOST = "poc.my.rubrik.com";

export const CLUSTERS = [
  { id: "6a271636-9392-4cba-90c5-bdbe227854ab", name: "sh1-PaloAlto" },
  { id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890", name: "rsc-demo-east" },
  { id: "f0e1d2c3-b4a5-9687-0123-456789abcdef", name: "cdm-lab-west" },
] as const;

export const OBJECTS = [
  {
    id: "83c4a80a-4a57-5699-b399-651089135586",
    name: "sh1-EncryptMe-05-Group1",
    type: "VmwareVm",
    location: "vCenter/Datacenter1/Cluster1",
  },
  {
    id: "b7e9f2a1-3c4d-5e6f-7890-123456789abc",
    name: "prod-sql-01",
    type: "VmwareVm",
    location: "vCenter/Datacenter1/SQL",
  },
  {
    id: "c1d2e3f4-a5b6-7890-cdef-0123456789ab",
    name: "fileserver-finance",
    type: "WindowsFileset",
    location: "NAS/Finance",
  },
  {
    id: "d4e5f6a7-b8c9-0123-def0-123456789abc",
    name: "oracle-prod-db",
    type: "OracleDatabase",
    location: "Oracle/Prod",
  },
  {
    id: "e5f6a7b8-c9d0-1234-ef01-23456789abcd",
    name: "Gold-SLA",
    type: "SlaDomain",
    location: "",
  },
] as const;

export const AUDIT_USERS = [
  { name: "admin@example.com", id: "u-admin-001" },
  { name: "backup.ops@example.com", id: "u-ops-002" },
  { name: "secops@example.com", id: "u-sec-003" },
  { name: "svc-rsc-api@example.com", id: "u-svc-004" },
] as const;

export const ORG = {
  id: "org-00000000-1111-2222-3333-444444444444",
  name: "Default Org",
} as const;

export type RubrikObject = (typeof OBJECTS)[number];
export type RubrikCluster = (typeof CLUSTERS)[number];

export function pickCluster(): RubrikCluster {
  return rand(CLUSTERS);
}

export function pickObject(preferHost = true): RubrikObject {
  if (preferHost) {
    const hosts = OBJECTS.filter((o) => o.type !== "SlaDomain");
    return rand(hosts);
  }
  return rand(OBJECTS);
}

export function pickUser() {
  return rand(AUDIT_USERS);
}

export function eventLink(seriesId: string, clusterId: string): string {
  return `https://${RUBRIK_TENANT_HOST}/events/details/${seriesId}?clusterUuid="${clusterId}"`;
}

export function newIds() {
  return { eventId: randUUID(), seriesId: randUUID() };
}
