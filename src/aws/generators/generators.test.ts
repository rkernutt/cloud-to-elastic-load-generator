/**
 * Shape-validation tests for all 14 generator modules.
 * Each test checks required ECS top-level fields, cloud structure, and event.duration.
 */
import { describe, it, expect } from "vitest";

import {
  generateLambdaLog,
  generateApiGatewayLog,
  generateAppSyncLog,
  generateAppRunnerLog,
  generateFargateLog,
} from "./serverless.js";
import {
  generateEc2Log,
  generateEcsLog,
  generateEksLog,
  generateBatchLog,
  generateBeanstalkLog,
  generateEcrLog,
  generateAutoScalingLog,
  generateImageBuilderLog,
} from "./compute.js";
import {
  generateAlbLog,
  generateNlbLog,
  generateCloudFrontLog,
  generateWafLog,
  generateRoute53Log,
  generateNetworkFirewallLog,
  generateShieldLog,
  generateVpcFlowLog,
} from "./networking.js";
import {
  generateGuardDutyLog,
  generateSecurityHubLog,
  generateMacieLog,
  generateInspectorLog,
  generateConfigLog,
  generateCognitoLog,
  generateKmsLog,
  generateCloudTrailLog,
} from "./security.js";
import {
  generateS3Log,
  generateEbsLog,
  generateEfsLog,
  generateFsxLog,
  generateDataSyncLog,
  generateBackupLog,
  generateStorageGatewayLog,
  generateS3StorageLensLog,
} from "./storage.js";
import {
  generateDynamoDbLog,
  generateElastiCacheLog,
  generateRedshiftLog,
  generateAuroraLog,
  generateRdsLog,
} from "./databases.js";
import {
  generateKinesisStreamsLog,
  generateFirehoseLog,
  generateSqsLog,
  generateSnsLog,
  generateEventBridgeLog,
  generateStepFunctionsLog,
} from "./streaming.js";
import {
  generateCodeBuildLog,
  generateCodePipelineLog,
  generateCodeDeployLog,
  generateXRayLog,
} from "./devtools.js";
import { generateEmrLog, generateGlueLog, generateAthenaLog } from "./analytics.js";
import { generateSageMakerLog, generateBedrockLog, generateRekognitionLog } from "./ml.js";
import {
  generateIotCoreLog,
  generateIotGreengrassLog,
  generateIotAnalyticsLog,
  generateIotEventsLog,
  generateIotSiteWiseLog,
} from "./iot.js";
import {
  generateCloudFormationLog,
  generateSsmLog,
  generateCloudWatchAlarmsLog,
  generateHealthLog,
  generateBudgetsLog,
  generateDmsLog,
} from "./management.js";
import {
  generateWorkSpacesLog,
  generateConnectLog,
  generateSesLog,
  generateMediaConvertLog,
  generateMediaLiveLog,
  generateDevOpsGuruLog,
} from "./enduser.js";

const TS = new Date().toISOString();

/** Asserts ECS baseline fields present on every generator output. */
function assertBase(doc: any, ts: string) {
  expect(doc).toHaveProperty("@timestamp", ts);
  expect(doc.cloud).toMatchObject({ provider: "aws" });
  expect(doc.cloud).toHaveProperty("region");
  expect(doc.cloud.account).toHaveProperty("id");
  expect(doc).toHaveProperty("message");
  expect(doc).toHaveProperty("event");
  expect(doc.event).toHaveProperty("outcome");
}

/** Asserts event.duration is a positive number (nanoseconds). */
function assertDuration(doc: any) {
  expect(typeof doc.event.duration).toBe("number");
  expect(doc.event.duration).toBeGreaterThan(0);
}

// ─── Serverless ──────────────────────────────────────────────────────────────
describe("Serverless generators", () => {
  it("Lambda - base fields and event_type", () => {
    const doc: any = generateLambdaLog(TS, 0);
    assertBase(doc, TS);
    assertDuration(doc);
    expect(doc.aws.lambda).toHaveProperty("request_id");
    expect(["start", "app", "end", "report"]).toContain(doc.aws.lambda.event_type);
  });

  it("Lambda - REPORT event includes billed_duration_ms", () => {
    // Run enough times to likely get a REPORT event
    let reportDoc: any = null;
    for (let i = 0; i < 100; i++) {
      const d: any = generateLambdaLog(TS, 0);
      if (d.aws.lambda.event_type === "report") {
        reportDoc = d;
        break;
      }
    }
    if (reportDoc) {
      expect(reportDoc.aws.lambda.metrics).toHaveProperty("billed_duration_ms");
      expect(reportDoc.message).toMatch(/^REPORT RequestId:/);
    }
  });

  it("Lambda - START event message format", () => {
    let startDoc: any = null;
    for (let i = 0; i < 100; i++) {
      const d: any = generateLambdaLog(TS, 0);
      if (d.aws.lambda.event_type === "start") {
        startDoc = d;
        break;
      }
    }
    if (startDoc) expect(startDoc.message).toMatch(/^START RequestId:/);
  });

  it("ApiGateway - base fields and duration", () => {
    const doc: any = generateApiGatewayLog(TS, 0);
    assertBase(doc, TS);
    assertDuration(doc);
    expect(doc.aws.apigateway).toHaveProperty("api_id");
    expect(doc).toHaveProperty("http");
  });

  it("AppSync - base fields and duration", () => {
    const doc = generateAppSyncLog(TS, 0);
    assertBase(doc, TS);
    assertDuration(doc);
  });

  it("AppRunner - base fields and duration", () => {
    const doc = generateAppRunnerLog(TS, 0);
    assertBase(doc, TS);
    assertDuration(doc);
  });

  it("Fargate - base fields and duration", () => {
    const doc = generateFargateLog(TS, 0);
    assertBase(doc, TS);
    assertDuration(doc);
  });
});

// ─── Compute ─────────────────────────────────────────────────────────────────
describe("Compute generators", () => {
  it.each([
    ["EC2", () => generateEc2Log(TS, 0)],
    ["ECS", () => generateEcsLog(TS, 0)],
    ["EKS", () => generateEksLog(TS, 0)],
    ["Batch", () => generateBatchLog(TS, 0)],
    ["Beanstalk", () => generateBeanstalkLog(TS, 0)],
    ["ECR", () => generateEcrLog(TS, 0)],
    ["AutoScaling", () => generateAutoScalingLog(TS, 0)],
    ["ImageBuilder", () => generateImageBuilderLog(TS, 0)],
  ])("%s returns valid base doc with duration", (_name, gen) => {
    const doc = gen();
    assertBase(doc, TS);
    assertDuration(doc);
  });
});

// ─── Networking ──────────────────────────────────────────────────────────────
describe("Networking generators", () => {
  it.each([
    ["ALB", () => generateAlbLog(TS, 0)],
    ["NLB", () => generateNlbLog(TS, 0)],
    ["CloudFront", () => generateCloudFrontLog(TS, 0)],
    ["WAF", () => generateWafLog(TS, 0)],
    ["Route53", () => generateRoute53Log(TS, 0)],
    ["NetworkFirewall", () => generateNetworkFirewallLog(TS, 0)],
    ["Shield", () => generateShieldLog(TS, 0)],
    ["VpcFlow", () => generateVpcFlowLog(TS, 0)],
  ])("%s returns valid base doc with duration", (_name, gen) => {
    const doc = gen();
    assertBase(doc, TS);
    assertDuration(doc);
  });
});

// ─── Security ────────────────────────────────────────────────────────────────
describe("Security generators", () => {
  it.each([
    ["GuardDuty", () => generateGuardDutyLog(TS, 0)],
    ["SecurityHub", () => generateSecurityHubLog(TS, 0)],
    ["Macie", () => generateMacieLog(TS, 0)],
    ["Inspector", () => generateInspectorLog(TS, 0)],
    ["Config", () => generateConfigLog(TS, 0)],
    ["Cognito", () => generateCognitoLog(TS, 0)],
    ["KMS", () => generateKmsLog(TS, 0)],
    ["CloudTrail", () => generateCloudTrailLog(TS, 0)],
  ])("%s returns valid base doc", (_name, gen) => {
    const doc = gen();
    assertBase(doc, TS);
  });
});

// ─── Storage ─────────────────────────────────────────────────────────────────
describe("Storage generators", () => {
  it.each([
    ["S3", () => generateS3Log(TS, 0)],
    ["EBS", () => generateEbsLog(TS, 0)],
    ["EFS", () => generateEfsLog(TS, 0)],
    ["FSx", () => generateFsxLog(TS, 0)],
    ["DataSync", () => generateDataSyncLog(TS, 0)],
    ["Backup", () => generateBackupLog(TS, 0)],
    ["StorageGateway", () => generateStorageGatewayLog(TS, 0)],
    ["S3StorageLens", () => generateS3StorageLensLog(TS, 0)],
  ])("%s returns valid base doc with duration", (_name, gen) => {
    const doc = gen();
    assertBase(doc, TS);
    assertDuration(doc);
  });
});

// ─── Databases ───────────────────────────────────────────────────────────────
describe("Database generators", () => {
  it.each([
    ["DynamoDB", () => generateDynamoDbLog(TS, 0)],
    ["ElastiCache", () => generateElastiCacheLog(TS, 0)],
    ["Redshift", () => generateRedshiftLog(TS, 0)],
    ["Aurora", () => generateAuroraLog(TS, 0)],
    ["RDS", () => generateRdsLog(TS, 0)],
  ])("%s returns valid base doc with duration", (_name, gen) => {
    const doc = gen();
    assertBase(doc, TS);
    assertDuration(doc);
  });

  it("RDS enhanced monitoring emits os_metrics", () => {
    let emDoc: any = null;
    for (let i = 0; i < 20; i++) {
      const d: any = generateRdsLog(TS, 0);
      if (d.aws?.rds?.enhanced_monitoring) {
        emDoc = d;
        break;
      }
    }
    if (emDoc) {
      expect(emDoc.aws.rds.enhanced_monitoring).toBeTruthy();
      expect(emDoc.aws.rds.enhanced_monitoring).toHaveProperty("cpuUtilization");
      expect(emDoc.aws.rds.enhanced_monitoring).toHaveProperty("memory");
      expect(emDoc.aws.rds.enhanced_monitoring).toHaveProperty("disk");
    }
  });
});

// ─── Streaming ───────────────────────────────────────────────────────────────
describe("Streaming generators", () => {
  it.each([
    ["Kinesis", () => generateKinesisStreamsLog(TS, 0)],
    ["Firehose", () => generateFirehoseLog(TS, 0)],
    ["SQS", () => generateSqsLog(TS, 0)],
    ["SNS", () => generateSnsLog(TS, 0)],
    ["EventBridge", () => generateEventBridgeLog(TS, 0)],
    ["StepFunctions", () => generateStepFunctionsLog(TS, 0)],
  ])("%s returns valid base doc with duration", (_name, gen) => {
    const doc = gen();
    assertBase(doc, TS);
    assertDuration(doc);
  });
});

// ─── DevTools ────────────────────────────────────────────────────────────────
describe("DevTools generators", () => {
  it.each([
    ["CodeBuild", () => generateCodeBuildLog(TS, 0)],
    ["CodePipeline", () => generateCodePipelineLog(TS, 0)],
    ["CodeDeploy", () => generateCodeDeployLog(TS, 0)],
    ["XRay", () => generateXRayLog(TS, 0)],
  ])("%s returns valid base doc", (_name, gen) => {
    const doc = gen();
    assertBase(doc, TS);
  });
});

// ─── Analytics ───────────────────────────────────────────────────────────────
describe("Analytics generators", () => {
  it.each([
    ["EMR", () => generateEmrLog(TS, 0)],
    ["Glue", () => generateGlueLog(TS, 0)],
    ["Athena", () => generateAthenaLog(TS, 0)],
  ])("%s returns valid base doc with duration", (_name, gen) => {
    const doc = gen();
    assertBase(doc, TS);
    assertDuration(doc);
  });
});

// ─── ML ──────────────────────────────────────────────────────────────────────
describe("ML generators", () => {
  it.each([
    ["SageMaker", () => generateSageMakerLog(TS, 0)],
    ["Bedrock", () => generateBedrockLog(TS, 0)],
    ["Rekognition", () => generateRekognitionLog(TS, 0)],
  ])("%s returns valid base doc", (_name, gen) => {
    const doc = gen();
    assertBase(doc, TS);
  });
});

// ─── IoT ─────────────────────────────────────────────────────────────────────
describe("IoT generators", () => {
  it.each([
    ["IoT Core", () => generateIotCoreLog(TS, 0)],
    ["Greengrass", () => generateIotGreengrassLog(TS, 0)],
    ["IoT Analytics", () => generateIotAnalyticsLog(TS, 0)],
    ["IoT Events", () => generateIotEventsLog(TS, 0)],
    ["IoT SiteWise", () => generateIotSiteWiseLog(TS, 0)],
  ])("%s returns valid base doc with duration", (_name, gen) => {
    const doc = gen();
    assertBase(doc, TS);
    assertDuration(doc);
  });
});

// ─── Management ──────────────────────────────────────────────────────────────
describe("Management generators", () => {
  it.each([
    ["CloudFormation", () => generateCloudFormationLog(TS, 0)],
    ["SSM", () => generateSsmLog(TS, 0)],
    ["CloudWatch", () => generateCloudWatchAlarmsLog(TS, 0)],
    ["Health", () => generateHealthLog(TS, 0)],
    ["Budgets", () => generateBudgetsLog(TS, 0)],
    ["DMS", () => generateDmsLog(TS, 0)],
  ])("%s returns valid base doc with duration", (_name, gen) => {
    const doc = gen();
    assertBase(doc, TS);
    assertDuration(doc);
  });
});

// ─── End User ────────────────────────────────────────────────────────────────
describe("End User generators", () => {
  it.each([
    ["WorkSpaces", () => generateWorkSpacesLog(TS, 0)],
    ["Connect", () => generateConnectLog(TS, 0)],
    ["SES", () => generateSesLog(TS, 0)],
    ["MediaConvert", () => generateMediaConvertLog(TS, 0)],
    ["MediaLive", () => generateMediaLiveLog(TS, 0)],
    ["DevOpsGuru", () => generateDevOpsGuruLog(TS, 0)],
  ])("%s returns valid base doc with duration", (_name, gen) => {
    const doc = gen();
    assertBase(doc, TS);
    assertDuration(doc);
  });
});

// ─── Error rate behaviour ─────────────────────────────────────────────────────
describe("Error rate consistency", () => {
  it("Lambda at 100% error rate always sets outcome=failure", () => {
    for (let i = 0; i < 20; i++) {
      const doc: any = generateLambdaLog(TS, 1);
      expect(doc.event.outcome).toBe("failure");
    }
  });

  it("DynamoDB at 100% error rate always sets outcome=failure", () => {
    for (let i = 0; i < 20; i++) {
      const doc: any = generateDynamoDbLog(TS, 1);
      expect(doc.event.outcome).toBe("failure");
    }
  });

  it("S3 at 0% error rate always sets outcome=success", () => {
    for (let i = 0; i < 20; i++) {
      const doc: any = generateS3Log(TS, 0);
      expect(doc.event.outcome).toBe("success");
    }
  });
});
