/**
 * Dimensional metric generators for AWS IoT and related device/edge services.
 * Metric names and dimensions follow CloudWatch namespaces (AWS/…).
 */

import {
  REGIONS,
  ACCOUNTS,
  rand,
  randInt,
  randId,
  dp,
  stat,
  counter,
  metricDoc,
  pickCloudContext,
  jitter,
} from "./helpers.js";
import type { EcsDocument } from "../types.js";

// ─── IoT Analytics (AWS/IoTAnalytics) ─────────────────────────────────────────

const IOTA_PIPELINES = ["ingest-main", "telemetry-enrich", "cold-path-archive", "rules-output"];

export function generateIotanalyticsMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const isErr = Math.random() < er;
  const incoming = randInt(5_000, 800_000);
  const succeeded = Math.round(incoming * jitter(0.94, 0.05, 0.7, 0.999));
  return [
    metricDoc(
      ts,
      "iotanalytics",
      "aws.iotanalytics",
      region,
      account,
      { PipelineName: rand(IOTA_PIPELINES) },
      {
        ActionExecution: counter(randInt(1_000, 500_000)),
        ActivitySucceeded: counter(succeeded),
        IncomingMessages: counter(incoming),
        PipelineActivityExecutionError: counter(isErr ? randInt(1, 5_000) : randInt(0, 50)),
      }
    ),
  ];
}

// ─── IoT Device Defender (AWS/IoTDeviceDefender) ──────────────────────────────

const DEFENDER_CHECKS = [
  "CA_DEVICE_CERTIFICATE_EXPIRING_CHECK",
  "REVOKED_CA_CERT_DETECTED_CHECK",
  "DEVICE_CERTIFICATE_SHARED_CHECK",
  "CONFLICTING_CLAIMS_CHECK",
];

export function generateIotdefenderMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const isErr = Math.random() < er;
  const auditDone = randInt(10_000, 2_000_000);
  return [
    metricDoc(
      ts,
      "iotdefender",
      "aws.iotdefender",
      region,
      account,
      { CheckName: rand(DEFENDER_CHECKS) },
      {
        NonCompliantResources: counter(isErr ? randInt(1, 500) : randInt(0, 40)),
        ViolationsDetected: counter(isErr ? randInt(1, 2_000) : randInt(0, 120)),
        AuditCheckCompletedCount: counter(auditDone),
      }
    ),
  ];
}

// ─── IoT Events (AWS/IoTEvents) ───────────────────────────────────────────────

export function generateIoteventsMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const isErr = Math.random() < er;
  const evals = randInt(50_000, 8_000_000);
  const succeeded = Math.round(evals * jitter(0.92, 0.06, 0.5, 0.999));
  return [
    metricDoc(
      ts,
      "iotevents",
      "aws.iotevents",
      region,
      account,
      {
        DetectorModelName: `detector-${randInt(1000, 9999)}`,
        InputName: rand(["telemetry", "alarm", "state_change", "heartbeat"]),
      },
      {
        SucceededActions: counter(succeeded),
        FailedActions: counter(isErr ? randInt(1, 15_000) : randInt(0, 400)),
        SystemErrors: counter(isErr ? randInt(0, 200) : randInt(0, 5)),
        ConditionEvaluations: counter(evals),
      }
    ),
  ];
}

// ─── IoT FleetWise (AWS/IoTFleetWise) ─────────────────────────────────────────

export function generateIotfleetwiseMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const isErr = Math.random() < er;
  const vehicles = randInt(10, 50_000);
  return [
    metricDoc(
      ts,
      "iotfleetwise",
      "aws.iotfleetwise",
      region,
      account,
      { VehicleName: `veh-${randInt(1e6, 9_999_999)}` },
      {
        SignalsFetched: counter(randInt(1_000_000, 500_000_000)),
        VehiclesConnected: counter(vehicles),
        DecoderManifestErrors: counter(isErr ? randInt(1, 3_000) : randInt(0, 30)),
      }
    ),
  ];
}

// ─── IoT SiteWise (AWS/IoTSiteWise) ─────────────────────────────────────────────

export function generateIotsitewiseMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "iotsitewise",
      "aws.iotsitewise",
      region,
      account,
      { GatewayId: `gw-${randId(16).toLowerCase()}` },
      {
        NumberOfAssetProperties: counter(randInt(5_000, 2_000_000)),
        MonitorActiveAlarms: counter(Math.random() < er ? randInt(1, 800) : randInt(0, 40)),
        TimeseriesDataReadCount: counter(randInt(100_000, 50_000_000)),
      }
    ),
  ];
}

// ─── IoT TwinMaker (AWS/IoTTwinMaker) ──────────────────────────────────────────

export function generateIottwinmakerMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const isErr = Math.random() < er;
  const success = randInt(10_000, 2_000_000);
  return [
    metricDoc(
      ts,
      "iottwinmaker",
      "aws.iottwinmaker",
      region,
      account,
      { WorkspaceId: `ws_${randId(12).toLowerCase()}` },
      {
        ComponentUpdateSuccess: counter(success),
        ComponentUpdateFailure: counter(isErr ? randInt(1, 5_000) : randInt(0, 80)),
        ReadEntityCount: counter(randInt(50_000, 20_000_000)),
      }
    ),
  ];
}

// ─── IoT Greengrass (AWS/Greengrass) ─────────────────────────────────────────

export function generateGreengrassMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const isErr = Math.random() < er;
  return [
    metricDoc(
      ts,
      "greengrass",
      "aws.greengrass",
      region,
      account,
      { CoreDeviceThingName: `gg-core-${randInt(100, 999)}` },
      {
        ConnectedDevices: counter(randInt(1, 25_000)),
        MessagesPublished: counter(randInt(10_000, 5_000_000)),
        DeploymentSucceeded: counter(randInt(20, 5_000)),
        DeploymentFailed: counter(isErr ? randInt(1, 150) : randInt(0, 8)),
      }
    ),
  ];
}

// ─── FreeRTOS (AWS/FreeRTOS) ──────────────────────────────────────────────────

export function generateFreertosMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const isErr = Math.random() < er;
  const otaOk = randInt(100, 50_000);
  return [
    metricDoc(
      ts,
      "freertos",
      "aws.freertos",
      region,
      account,
      { ThingName: `device-${randId(10).toLowerCase()}` },
      {
        OTAUpdateSuccess: counter(otaOk),
        OTAUpdateFailure: counter(isErr ? randInt(1, 2_000) : randInt(0, 40)),
        ConnectedDevices: counter(randInt(500, 500_000)),
      }
    ),
  ];
}

// ─── Kinesis Video Streams (AWS/KinesisVideo) ──────────────────────────────────

export function generateKinesisvideoMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const isErr = Math.random() < er;
  const stream = `stream-${rand(["prod", "cam", "door"])}-${randInt(1, 99)}`;
  return [
    metricDoc(
      ts,
      "kinesisvideo",
      "aws.kinesisvideo",
      region,
      account,
      { StreamName: stream },
      {
        "PutMedia.Latency": stat(dp(jitter(45, 35, 5, 2_000))),
        "GetMedia.Success": counter(randInt(5_000, 2_000_000)),
        StreamFragmentCount: counter(randInt(10_000, 10_000_000)),
        "PutMedia.Errors": counter(isErr ? randInt(1, 8_000) : randInt(0, 100)),
      }
    ),
  ];
}

// ─── Amazon Monitron (AWS/Monitron) ────────────────────────────────────────────

export function generateMonitronMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const isErr = Math.random() < er;
  return [
    metricDoc(
      ts,
      "monitron",
      "aws.monitron",
      region,
      account,
      { SiteName: rand(["PlantA", "Warehouse-1", "Line-7"]) },
      {
        SensorCount: counter(randInt(200, 80_000)),
        AbnormalConditions: counter(isErr ? randInt(1, 500) : randInt(0, 25)),
        WarningConditions: counter(randInt(0, 300)),
      }
    ),
  ];
}

// ─── AWS Panorama (AWS/Panorama) ───────────────────────────────────────────────

export function generatePanoramaMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const isErr = Math.random() < er;
  return [
    metricDoc(
      ts,
      "panorama",
      "aws.panorama",
      region,
      account,
      {
        DeviceId: `device-${randId(8).toLowerCase()}`,
      },
      {
        DeviceRunning: counter(randInt(1, 500)),
        ModelInferenceLatency: stat(dp(jitter(35, 28, 8, 800))),
        ApplicationErrors: counter(isErr ? randInt(1, 2_000) : randInt(0, 50)),
      }
    ),
  ];
}

// ─── AWS RoboMaker (AWS/RoboMaker) ────────────────────────────────────────────

export function generateRobomakerMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const isErr = Math.random() < er;
  const succeeded = randInt(20, 5_000);
  const failed = isErr ? randInt(1, 400) : randInt(0, 15);
  return [
    metricDoc(
      ts,
      "robomaker",
      "aws.robomaker",
      region,
      account,
      { SimulationJobId: `simjob-${randId(16).toLowerCase()}` },
      {
        SimulationJobDuration: stat(dp(jitter(420, 380, 30, 7200)), {
          max: dp(jitter(9000, 2000, 120, 14_400)),
          min: dp(jitter(30, 20, 5, 600)),
        }),
        SimulationJobSucceeded: counter(succeeded),
        SimulationJobFailed: counter(failed),
      }
    ),
  ];
}
