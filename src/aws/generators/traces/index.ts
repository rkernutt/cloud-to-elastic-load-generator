/**
 * Registry of trace generators.
 * Each generator returns an array of APM documents (transaction + child spans).
 */

export { TRACE_SERVICES } from "./services.js";

import { generateLambdaTrace } from "./lambda.js";
import { generateEmrTrace } from "./emr.js";
import {
  generateEcommerceOrderTrace,
  generateMlInferenceTrace,
  generateDataIngestionTrace,
  generateStepFunctionsWorkflowTrace,
  generateCascadingFailureTrace,
} from "./workflow.js";
import {
  generatePipelineS3SqsChainedTrace,
  generatePipelineStepFunctionsOrchestratedTrace,
} from "./workflow-pipelines.js";
import { generateApiGatewayTrace } from "./apigateway.js";
import { generateS3Trace } from "./s3.js";
import { generateGlueTrace } from "./glue.js";
import { generateEventBridgeTrace } from "./eventbridge.js";
import { generateSageMakerTrace } from "./sagemaker.js";
import { generateEcsTrace } from "./ecs.js";
import { generateStepFunctionsTrace } from "./stepfunctions.js";
import { generateEksTrace } from "./eks.js";
import { generateSqsTrace } from "./sqs.js";
import { generateKinesisTrace } from "./kinesis.js";
import { generateDynamoDbTrace } from "./dynamodb.js";
import { generateRdsTrace } from "./rds.js";
import { generateBedrockTrace } from "./bedrock.js";
import { generateSnsEventFanoutTrace } from "./workflow-sns-fanout.js";
import { generateFirehoseTrace } from "./firehose.js";
import { generateMskTrace } from "./msk.js";
import { generateSnsTrace } from "./sns.js";
import { generateBedrockAgentTrace } from "./bedrockagent.js";
import { generateEc2Trace } from "./ec2.js";
import { generateElastiCacheTrace } from "./elasticache.js";
import { generateOpenSearchTrace } from "./opensearch.js";
import { generateRedshiftTrace } from "./redshift.js";
import { generateAthenaTrace } from "./athena.js";
import { generateCognitoTrace } from "./cognito.js";
import { generateCloudFrontTrace } from "./cloudfront.js";
import { generateNeptuneTrace } from "./neptune.js";
import { generateDocDbTrace } from "./docdb.js";
import { generateAuroraTrace } from "./aurora.js";
import { generateSecretsManagerTrace } from "./secretsmanager.js";
import { generateKmsTrace } from "./kms.js";
import { generateAlbTrace } from "./alb.js";
import { generateAmplifyTrace } from "./amplify.js";
import { generateApprunnerTrace } from "./apprunner.js";
import { generateBatchTrace } from "./batch.js";
import { generateCloudformationTrace } from "./cloudformation.js";
import { generateCodebuildTrace } from "./codebuild.js";
import { generateCodepipelineTrace } from "./codepipeline.js";
import { generateEbsTrace } from "./ebs.js";
import { generateEfsTrace } from "./efs.js";
import { generateFargateTrace } from "./fargate.js";
import { generateGuarddutyTrace } from "./guardduty.js";
import { generateIotcoreTrace } from "./iotcore.js";
import { generateMwaaTrace } from "./mwaa.js";
import { generateQuicksightTrace } from "./quicksight.js";
import { generateWafTrace } from "./waf.js";

/**
 * Map of service id → trace generator function.
 * Signature: (ts: string, er: number) => Object[]
 */
const TRACE_GENERATORS = {
  lambda: generateLambdaTrace,
  emr: generateEmrTrace,
  "workflow-ecommerce": generateEcommerceOrderTrace,
  "workflow-ml": generateMlInferenceTrace,
  "workflow-ingestion": generateDataIngestionTrace,
  "workflow-stepfunctions": generateStepFunctionsWorkflowTrace,
  "workflow-cascading": generateCascadingFailureTrace,
  "workflow-pipeline-s3sqs": generatePipelineS3SqsChainedTrace,
  "workflow-pipeline-sfn": generatePipelineStepFunctionsOrchestratedTrace,
  "workflow-sns-fanout": generateSnsEventFanoutTrace,
  apigateway: generateApiGatewayTrace,
  s3: generateS3Trace,
  glue: generateGlueTrace,
  eventbridge: generateEventBridgeTrace,
  sagemaker: generateSageMakerTrace,
  ecs: generateEcsTrace,
  stepfunctions: generateStepFunctionsTrace,
  eks: generateEksTrace,
  sqs: generateSqsTrace,
  kinesis: generateKinesisTrace,
  dynamodb: generateDynamoDbTrace,
  rds: generateRdsTrace,
  bedrock: generateBedrockTrace,
  firehose: generateFirehoseTrace,
  msk: generateMskTrace,
  sns: generateSnsTrace,
  bedrockagent: generateBedrockAgentTrace,
  ec2: generateEc2Trace,
  elasticache: generateElastiCacheTrace,
  opensearch: generateOpenSearchTrace,
  redshift: generateRedshiftTrace,
  athena: generateAthenaTrace,
  cognito: generateCognitoTrace,
  cloudfront: generateCloudFrontTrace,
  neptune: generateNeptuneTrace,
  docdb: generateDocDbTrace,
  aurora: generateAuroraTrace,
  secretsmanager: generateSecretsManagerTrace,
  kms: generateKmsTrace,
  alb: generateAlbTrace,
  amplify: generateAmplifyTrace,
  apprunner: generateApprunnerTrace,
  batch: generateBatchTrace,
  cloudformation: generateCloudformationTrace,
  codebuild: generateCodebuildTrace,
  codepipeline: generateCodepipelineTrace,
  ebs: generateEbsTrace,
  efs: generateEfsTrace,
  fargate: generateFargateTrace,
  guardduty: generateGuarddutyTrace,
  iotcore: generateIotcoreTrace,
  mwaa: generateMwaaTrace,
  quicksight: generateQuicksightTrace,
  waf: generateWafTrace,
};

export { TRACE_GENERATORS };
