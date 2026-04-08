import {
  rand,
  randInt,
  randFloat,
  randId,
  randIp,
  randUUID,
  randAccount,
  REGIONS,
  USER_AGENTS,
  HTTP_METHODS,
  HTTP_PATHS,
} from "../../helpers";
import type { EcsDocument } from "./types.js";

function generateGuardDutyLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isFinding = Math.random() < er + 0.3;
  const findingTypes = [
    "UnauthorizedAccess:EC2/SSHBruteForce",
    "UnauthorizedAccess:EC2/RDPBruteForce",
    "Recon:EC2/PortScan",
    "Backdoor:EC2/C&CActivity.B",
    "CryptoCurrency:EC2/BitcoinTool.B!DNS",
    "Trojan:EC2/DNSDataExfiltration",
    "UnauthorizedAccess:IAMUser/ConsoleLoginSuccess.B",
    "Policy:IAMUser/RootCredentialUsage",
    "UnauthorizedAccess:IAMUser/MaliciousIPCaller.Custom",
    "Discovery:S3/TorIPCaller",
    "Impact:S3/MaliciousIPCaller",
    "Exfiltration:S3/MaliciousIPCaller",
    "Stealth:IAMUser/PasswordPolicyChange",
    "UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration.OutsideAWS",
    "InitialAccess:IAMUser/AnomalousBehavior",
    "Persistence:IAMUser/AnomalousBehavior",
    "PrivilegeEscalation:IAMUser/AnomalousBehavior",
  ];
  const ft = rand(findingTypes);
  const sev = isFinding ? rand([2.0, 4.0, 5.0, 7.0, 8.0]) : 0;
  const sevValue = sev >= 7 ? "High" : sev >= 4 ? "Medium" : sev >= 1 ? "Low" : "Informational";
  const findingId = randId(32).toLowerCase();
  const detectorId = randId(32).toLowerCase();
  const instanceId = `i-${randId(17).toLowerCase()}`;
  const isDnsFinding = ft.includes("DNS");
  const isNetworkFinding = ft.includes(":EC2/") || ft.includes("MaliciousIP");
  const srcIp = randIp();
  const dstIp = randIp();
  const srcGeo = rand([
    {
      country_iso_code: "CN",
      country_name: "China",
      city_name: "Beijing",
      location: { lat: 39.9042, lon: 116.4074 },
    },
    {
      country_iso_code: "RU",
      country_name: "Russia",
      city_name: "Moscow",
      location: { lat: 55.7558, lon: 37.6173 },
    },
    {
      country_iso_code: "IR",
      country_name: "Iran",
      city_name: "Tehran",
      location: { lat: 35.6892, lon: 51.389 },
    },
    {
      country_iso_code: "KP",
      country_name: "North Korea",
      city_name: "Pyongyang",
      location: { lat: 39.0194, lon: 125.7381 },
    },
    {
      country_iso_code: "US",
      country_name: "United States",
      city_name: "Ashburn",
      location: { lat: 39.0438, lon: -77.4874 },
    },
    {
      country_iso_code: "GB",
      country_name: "United Kingdom",
      city_name: "London",
      location: { lat: 51.5074, lon: -0.1278 },
    },
    {
      country_iso_code: "DE",
      country_name: "Germany",
      city_name: "Frankfurt",
      location: { lat: 50.1109, lon: 8.6821 },
    },
    {
      country_iso_code: "IN",
      country_name: "India",
      city_name: "Mumbai",
      location: { lat: 19.076, lon: 72.8777 },
    },
  ]);
  const threatIndicatorType = isDnsFinding ? "domain" : "ip";
  const threatPurpose = ft.split(":")[0];
  const gdCategory = ["CryptoCurrency", "Trojan", "Backdoor"].includes(threatPurpose)
    ? "malware"
    : ["Recon", "PrivilegeEscalation", "InitialAccess", "Persistence"].includes(threatPurpose)
      ? "intrusion_detection"
      : "threat";
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "guardduty" },
    },
    aws: {
      dimensions: { DetectorId: detectorId },
      guardduty: {
        schema_version: "2.0",
        account_id: acct.id,
        region,
        partition: "aws",
        id: findingId,
        arn: `arn:aws:guardduty:${region}:${acct.id}:detector/${detectorId}/finding/${findingId}`,
        type: ft,
        title: ft.replace(/^[^:]+:/, "").replace(/[/.!]/g, " "),
        description: isFinding
          ? `GuardDuty detected suspicious activity: ${ft}`
          : "Routine check completed.",
        created_at: ts,
        updated_at: ts,
        severity: { code: sev, value: sevValue },
        confidence: Number(randFloat(60, 99)),
        resource: {
          type: rand(["Instance", "AccessKey", "S3Bucket", "EKSCluster"]),
          ...(isFinding
            ? {
                instance_details: {
                  availability_zone: `${region}${rand(["a", "b", "c"])}`,
                  instance: {
                    id: instanceId,
                    type: rand(["t3.medium", "m5.large"]),
                    state: "running",
                  },
                  image: { id: `ami-${randId(8).toLowerCase()}`, description: "Amazon Linux 2" },
                  network_interfaces: [
                    {
                      network_interface_id: `eni-${randId(8).toLowerCase()}`,
                      private_ip_address: randIp(),
                      subnet_id: `subnet-${randId(8).toLowerCase()}`,
                      vpc_id: `vpc-${randId(8).toLowerCase()}`,
                      security_groups: [
                        { group_id: `sg-${randId(8).toLowerCase()}`, group_name: "default" },
                      ],
                    },
                  ],
                },
              }
            : {}),
        },
        service: {
          detector_id: detectorId,
          count: randInt(1, 500),
          archived: false,
          ...(isFinding
            ? {
                action: {
                  action_type: rand([
                    "NETWORK_CONNECTION",
                    "PORT_PROBE",
                    "DNS_REQUEST",
                    "AWS_API_CALL",
                  ]),
                },
              }
            : {}),
          ...(isFinding && isDnsFinding
            ? {
                evidence: {
                  threat_intelligence_details: [
                    {
                      threat_names: [
                        rand([
                          "DenialOfService",
                          "CryptoCurrency",
                          "Backdoor",
                          "Trojan",
                          "UnauthorizedAccess",
                        ]),
                      ],
                      threat_list_name: rand(["ProofPoint", "Emerging Threats", "ThreatIntelSet"]),
                    },
                  ],
                },
              }
            : {}),
        },
        metrics: {
          FindingCount: { sum: isFinding ? randInt(1, 50) : 0 },
          HighSeverityFindingCount: { sum: isFinding && sev >= 7 ? randInt(1, 10) : 0 },
          MediumSeverityFindingCount: {
            sum: isFinding && sev >= 4 && sev < 7 ? randInt(1, 20) : 0,
          },
          LowSeverityFindingCount: { sum: isFinding && sev < 4 ? randInt(1, 30) : 0 },
        },
      },
    },
    rule: {
      category: gdCategory,
      ruleset: isFinding ? ft.split(":")[0] : undefined,
      name: isFinding ? ft : undefined,
    },
    threat: {
      indicator: [
        {
          type: threatIndicatorType,
          value: isDnsFinding ? `suspicious-${randId(8).toLowerCase()}.example.com` : srcIp,
        },
      ],
    },
    ...(isFinding && isNetworkFinding
      ? {
          source: {
            ip: srcIp,
            geo: {
              country_iso_code: srcGeo.country_iso_code,
              country_name: srcGeo.country_name,
              city_name: srcGeo.city_name,
              location: srcGeo.location,
            },
          },
          destination: { ip: dstIp },
        }
      : {}),
    event: {
      kind: "alert",
      severity: sev,
      outcome: isFinding ? "failure" : "success",
      category: [gdCategory],
      type: ["indicator"],
      dataset: "aws.guardduty",
      provider: "guardduty.amazonaws.com",
    },
    message: isFinding
      ? `GuardDuty finding [${sevValue}]: ${ft}`
      : `GuardDuty: no threats detected`,
    log: { level: sev >= 7 ? "error" : sev >= 4 ? "warn" : "info" },
    ...(isFinding
      ? { error: { code: "ThreatFinding", message: `GuardDuty finding: ${ft}`, type: "security" } }
      : {}),
  };
}

function generateSecurityHubLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isFinding = Math.random() < er + 0.25;
  const standardsSlug = [
    "aws-foundational-security-best-practices",
    "cis-aws-foundations-benchmark",
    "pci-dss",
  ];
  const sev = isFinding
    ? rand(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFORMATIONAL"])
    : "INFORMATIONAL";
  const isCIS = Math.random() > 0.5;
  const controlId = isCIS
    ? rand([
        "CIS.1.1",
        "CIS.1.2",
        "CIS.1.3",
        "CIS.1.4",
        "CIS.2.1",
        "CIS.2.2",
        "CIS.2.7",
        "CIS.3.1",
        "CIS.3.2",
        "CIS.3.3",
      ])
    : rand([
        "IAM.1",
        "IAM.2",
        "IAM.3",
        "S3.1",
        "S3.2",
        "S3.3",
        "EC2.1",
        "EC2.2",
        "Lambda.1",
        "Lambda.2",
        "RDS.1",
        "CloudTrail.1",
        "CloudTrail.2",
      ]);
  const findingId = `${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`;
  const findingType = rand([
    "Software and Configuration Checks/AWS Security Best Practices",
    "Software and Configuration Checks/Industry and Regulatory Standards/CIS AWS Foundations Benchmark",
    "Threat Detections/Tactics/Impact",
    "Effects/Data Exposure",
    "Software and Configuration Checks/Vulnerabilities/CVE",
  ]);
  const createdTs = new Date(Date.parse(ts) - randInt(0, 86400000)).toISOString();
  const shCategory = findingType.startsWith("Threat")
    ? "vulnerability"
    : findingType.startsWith("Effects")
      ? "vulnerability"
      : "compliance";
  const shEventType = isFinding ? ["indicator"] : ["info"];
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "securityhub" },
    },
    aws: {
      dimensions: { ComplianceStandard: rand(standardsSlug), ControlId: controlId },
      securityhub_findings: {
        id: findingId,
        aws_account_id: acct.id,
        region,
        description: isFinding
          ? `Security check failed: ${controlId} - ${rand(["MFA not enabled for root", "S3 bucket is publicly accessible", "Default security group allows all traffic"])}`
          : "Control passed.",
        created_at: createdTs,
        first_observed_at: createdTs,
        last_observed_at: ts,
        generator: { id: controlId },
        types: [findingType],
        compliance: { security_control_id: controlId, status: isFinding ? "FAILED" : "PASSED" },
        severity: {
          label: sev,
          normalized:
            sev === "CRITICAL"
              ? 90
              : sev === "HIGH"
                ? 70
                : sev === "MEDIUM"
                  ? 40
                  : sev === "LOW"
                    ? 20
                    : 0,
        },
        workflow: { status: rand(["NEW", "NOTIFIED", "RESOLVED", "SUPPRESSED"]) },
        record_state: isFinding ? "ACTIVE" : "ARCHIVED",
        product: {
          arn: `arn:aws:securityhub:${region}::product/aws/securityhub`,
          name: "Security Hub",
        },
        criticality: sev === "CRITICAL" ? 9 : sev === "HIGH" ? 7 : 4,
        confidence: randInt(70, 99),
      },
    },
    rule: {
      id: controlId,
      name: `${controlId} — ${rand(["MFA not enabled for root", "S3 bucket publicly accessible", "Security group allows all traffic", "CloudTrail not enabled", "VPC flow logs disabled"])}`,
    },
    event: {
      kind: "alert",
      severity: sev === "CRITICAL" ? 9 : sev === "HIGH" ? 7 : 4,
      outcome: isFinding ? "failure" : "success",
      category: [shCategory],
      type: shEventType,
      dataset: "aws.securityhub_findings",
      provider: "securityhub.amazonaws.com",
    },
    message: isFinding
      ? `Security Hub [${sev}]: Compliance check failed`
      : `Security Hub: control passed`,
    log: { level: sev === "CRITICAL" ? "error" : sev === "HIGH" ? "warn" : "info" },
    ...(isFinding
      ? {
          error: {
            code: "ComplianceFailed",
            message: `Control ${controlId} failed`,
            type: "compliance",
          },
        }
      : {}),
  };
}

function generateMacieLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isFinding = Math.random() < er + 0.2;
  const dataTypes = [
    "SensitiveData:S3Object/Credentials",
    "SensitiveData:S3Object/Financial",
    "SensitiveData:S3Object/Personal",
    "SensitiveData:S3Object/Multiple",
    "Policy:IAMUser/S3BucketPublic",
    "Policy:IAMUser/S3BucketReplicatedExternally",
    "Policy:IAMUser/S3BucketSharedExternally",
    "Policy:IAMUser/S3BucketSharedWithCloudFront",
  ];
  const bucket = rand([
    "prod-data",
    "raw-uploads",
    "customer-exports",
    "analytics-output",
    "backup-bucket",
  ]);
  const bucketName = `${bucket}-${region}`;
  const findingType = isFinding ? rand(dataTypes) : "none";
  const dataIdentifier = rand([
    "AWS_CREDENTIALS",
    "CREDIT_CARD_NUMBER",
    "DRIVER_LICENSE_US",
    "EMAIL_ADDRESS",
    "FINANCIAL_INFORMATION",
    "HIPAA",
    "IP_ADDRESS",
    "NAME",
    "PASSPORT_NUMBER",
    "PHONE_NUMBER",
    "SSN_US",
    "TIN_US",
  ]);
  const isPolicyFinding = findingType.startsWith("Policy:");
  const macieCategory = isPolicyFinding
    ? "intrusion_detection"
    : findingType.includes("Credentials")
      ? "malware"
      : "vulnerability";
  const ownerId = randId(64).toLowerCase();
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "macie" },
    },
    aws: {
      dimensions: { BucketName: bucketName },
      macie: {
        finding_id: `${randId(8)}-${randId(4)}-${randId(4)}`.toLowerCase(),
        finding_type: findingType,
        severity: isFinding ? rand(["HIGH", "MEDIUM", "LOW"]) : "INFORMATIONAL",
        s3_bucket: { name: bucketName, arn: `arn:aws:s3:::${bucketName}` },
        s3_bucket_full: {
          name: bucketName,
          arn: `arn:aws:s3:::${bucketName}`,
          owner_id: ownerId,
          default_server_side_encryption: { encryption_type: rand(["AES256", "aws:kms", "NONE"]) },
          tags: [{ key: "Environment", value: rand(["prod", "staging", "dev"]) }],
          public_access: {
            effective_permission: isPolicyFinding ? "PUBLIC" : "NOT_PUBLIC",
            block_public_acls: !isPolicyFinding,
            block_public_policy: !isPolicyFinding,
            ignore_public_acls: !isPolicyFinding,
            restrict_public_buckets: !isPolicyFinding,
          },
        },
        occurrences: isFinding ? randInt(1, 50000) : 0,
        sensitive_data_categories: isFinding
          ? [rand(["PII", "FINANCIAL", "CREDENTIALS", "MEDICAL"])]
          : [],
        data_identifiers: isFinding ? [dataIdentifier] : [],
      },
    },
    event: {
      kind: "alert",
      outcome: isFinding ? "failure" : "success",
      category: [macieCategory],
      dataset: "aws.macie",
      provider: "macie2.amazonaws.com",
    },
    message: isFinding
      ? `Macie detected sensitive data in s3://${bucketName}: ${findingType}`
      : `Macie scan complete: no sensitive data found`,
    log: { level: isFinding ? "warn" : "info" },
    ...(isFinding
      ? {
          error: {
            code: "SensitiveDataFound",
            message: `Sensitive data in s3://${bucketName}`,
            type: "data",
          },
        }
      : {}),
  };
}

function generateInspectorLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const findingType = rand([
    "PACKAGE_VULNERABILITY",
    "PACKAGE_VULNERABILITY",
    "PACKAGE_VULNERABILITY",
    "NETWORK_REACHABILITY",
    "CODE_VULNERABILITY",
  ]);
  const severity = isErr
    ? rand(["CRITICAL", "HIGH"])
    : rand(["MEDIUM", "LOW", "INFORMATIONAL", "HIGH"]);
  const resourceType = rand([
    "AWS_EC2_INSTANCE",
    "AWS_ECR_CONTAINER_IMAGE",
    "AWS_LAMBDA_FUNCTION",
    "AWS_EC2_INSTANCE",
  ]);
  const cvssScore =
    severity === "CRITICAL"
      ? Number(randFloat(9.0, 10.0))
      : severity === "HIGH"
        ? Number(randFloat(7.0, 8.9))
        : severity === "MEDIUM"
          ? Number(randFloat(4.0, 6.9))
          : Number(randFloat(0.1, 3.9));
  const cveId = `CVE-${randInt(2020, 2024)}-${randInt(10000, 99999)}`;
  const packageName = rand([
    "openssl",
    "libssl",
    "curl",
    "log4j",
    "spring-core",
    "jackson-databind",
    "lodash",
    "axios",
    "requests",
    "werkzeug",
  ]);
  const packageVersion = `${randInt(1, 3)}.${randInt(0, 20)}.${randInt(0, 10)}`;
  const fixedVersion = `${randInt(1, 3)}.${randInt(0, 20)}.${randInt(11, 20)}`;
  const resourceId =
    resourceType === "AWS_EC2_INSTANCE"
      ? `i-${randId(17).toLowerCase()}`
      : resourceType === "AWS_ECR_CONTAINER_IMAGE"
        ? `${acct.id}.dkr.ecr.${region}.amazonaws.com/my-repo:latest`
        : `arn:aws:lambda:${region}:${acct.id}:function:my-fn`;
  const exploitability = rand([
    "NOT_DEFINED",
    "PROOF_OF_CONCEPT",
    "FUNCTIONAL",
    "HIGH",
    "NOT_DEFINED",
    "NOT_DEFINED",
  ]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "inspector2" },
    },
    aws: {
      dimensions: { Severity: severity },
      inspector2: {
        finding_id:
          `arn:aws:inspector2:${region}:${acct.id}:finding/${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`.toLowerCase(),
        finding_type: findingType,
        finding_status: rand(["ACTIVE", "ACTIVE", "ACTIVE", "SUPPRESSED"]),
        severity,
        severity_score: parseFloat(cvssScore.toFixed(1)),
        exploitability,
        resource_type: resourceType,
        resource_id: resourceId,
        first_observed_at: new Date(
          new Date(ts).getTime() - randInt(1, 30) * 86400000
        ).toISOString(),
        last_observed_at: ts,
        ...(findingType === "PACKAGE_VULNERABILITY"
          ? {
              package_vulnerability: {
                cve_id: cveId,
                source: rand(["NVD", "GHSA"]),
                cvss3_score: cvssScore,
                vulnerable_packages: [
                  {
                    name: packageName,
                    version: packageVersion,
                    fixed_in_version: fixedVersion,
                    package_manager: rand(["OS", "PYTHON", "NPM", "JAVA", "DOTNET"]),
                  },
                ],
                related_vulnerabilities:
                  Math.random() < 0.3
                    ? [`CVE-${randInt(2020, 2024)}-${randInt(10000, 99999)}`]
                    : [],
              },
            }
          : findingType === "NETWORK_REACHABILITY"
            ? {
                network_reachability: {
                  protocol: rand(["TCP", "UDP"]),
                  open_port_range: {
                    begin: rand([22, 80, 443, 3306, 5432, 6379, 8080]),
                    end: rand([22, 80, 443, 3306, 5432, 6379, 8080]),
                  },
                  network_path: rand(["sg -> igw", "sg -> nat -> igw", "sg -> vpc-peering"]),
                },
              }
            : {
                code_vulnerability: {
                  cwes: [rand(["CWE-89", "CWE-79", "CWE-20", "CWE-287", "CWE-311"])],
                  detector_name: rand(["CodeGuru Detector", "Semgrep"]),
                  file_path: {
                    name: rand(["app.py", "handler.js", "main.go", "Controller.java"]),
                    line_number: randInt(10, 500),
                  },
                },
              }),
        metrics: {
          TotalFindings: { sum: randInt(1, 500) },
          CriticalFindings: { sum: severity === "CRITICAL" ? randInt(1, 50) : 0 },
          HighFindings: { sum: severity === "HIGH" ? randInt(1, 100) : 0 },
          MediumFindings: { sum: severity === "MEDIUM" ? randInt(1, 200) : 0 },
          LowFindings: { sum: ["LOW", "INFORMATIONAL"].includes(severity) ? randInt(1, 300) : 0 },
          CoveredResources: { avg: randInt(10, 5000) },
        },
      },
    },
    vulnerability: {
      severity,
      id: findingType === "PACKAGE_VULNERABILITY" ? cveId : undefined,
      score: { base: cvssScore },
    },
    package:
      findingType === "PACKAGE_VULNERABILITY"
        ? { name: packageName, version: packageVersion }
        : undefined,
    event: {
      outcome: ["CRITICAL", "HIGH"].includes(severity) ? "failure" : "success",
      category: ["vulnerability"],
      type: ["info"],
      dataset: "aws.inspector2",
      provider: "inspector2.amazonaws.com",
    },
    message:
      findingType === "PACKAGE_VULNERABILITY"
        ? `Inspector2 [${severity}]: ${cveId} in ${packageName} ${packageVersion} on ${resourceType} (fix: ${fixedVersion})`
        : `Inspector2 [${severity}]: ${findingType} detected on ${resourceType}`,
    log: {
      level: ["CRITICAL", "HIGH"].includes(severity)
        ? "error"
        : severity === "MEDIUM"
          ? "warn"
          : "info",
    },
    ...(["CRITICAL", "HIGH"].includes(severity)
      ? {
          error: {
            code: cveId,
            message: `${severity} vulnerability: ${packageName}`,
            type: "vulnerability",
          },
        }
      : {}),
  };
}

function generateConfigLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isNonCompliant = Math.random() < er + 0.2;
  const rules = [
    "s3-bucket-public-read-prohibited",
    "s3-bucket-ssl-requests-only",
    "iam-root-access-key-check",
    "iam-user-mfa-enabled",
    "ec2-instance-no-public-ip",
    "restricted-ssh",
    "restricted-common-ports",
    "vpc-flow-logs-enabled",
    "cloudtrail-enabled",
    "cloud-trail-encryption-enabled",
    "root-account-mfa-enabled",
    "access-keys-rotated",
    "iam-password-policy",
    "ec2-stopped-instance",
    "eip-attached",
  ];
  const resources = [
    "AWS::EC2::Instance",
    "AWS::S3::Bucket",
    "AWS::IAM::User",
    "AWS::RDS::DBInstance",
    "AWS::EC2::SecurityGroup",
  ];
  const rule = rand(rules);
  const resource = rand(resources);
  const complianceStatus = rand([
    "COMPLIANT",
    "NON_COMPLIANT",
    "NOT_APPLICABLE",
    "INSUFFICIENT_DATA",
  ]);
  const isNonCompliantFinal =
    complianceStatus === "NON_COMPLIANT" || (isNonCompliant && complianceStatus !== "COMPLIANT");
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "config" },
    },
    aws: {
      dimensions: { ConfigRuleName: rule, ResourceType: resource },
      config: {
        rule_name: rule,
        compliance_type: complianceStatus,
        resource_type: resource,
        resource_id: `${rand(["i", "sg", "s3", "db"])}-${randId(8).toLowerCase()}`,
        annotation: isNonCompliantFinal
          ? rand([
              "Resource is not compliant",
              "Missing required tag",
              "Encryption not enabled",
              "Public access enabled",
            ])
          : "Resource is compliant",
        metrics: {
          ComplianceByConfigRule: { avg: isNonCompliantFinal ? 0 : 1 },
          NonCompliantRules: { sum: isNonCompliantFinal ? 1 : 0 },
          CompliantRules: { sum: isNonCompliantFinal ? 0 : 1 },
          ConfigurationItemsRecorded: { sum: randInt(1, 100) },
        },
      },
    },
    event: {
      outcome: isNonCompliantFinal ? "failure" : "success",
      category: ["configuration", "compliance"],
      dataset: "aws.config",
      provider: "config.amazonaws.com",
    },
    message: isNonCompliantFinal ? `Config rule FAILED: ${rule}` : `Config rule PASSED: ${rule}`,
    log: { level: isNonCompliantFinal ? "warn" : "info" },
    ...(isNonCompliantFinal
      ? {
          error: {
            code: "NonCompliant",
            message: `Config rule ${rule} failed`,
            type: "compliance",
          },
        }
      : {}),
  };
}

function generateAccessAnalyzerLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isFinding = Math.random() < er + 0.15;
  const resourceTypes = [
    "AWS::S3::Bucket",
    "AWS::IAM::Role",
    "AWS::KMS::Key",
    "AWS::Lambda::Function",
    "AWS::SQS::Queue",
  ];
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "access-analyzer" },
    },
    aws: {
      dimensions: { AnalyzerName: `analyzer-${region}` },
      access_analyzer: {
        finding_id: `${randId(8)}-${randId(4)}-${randId(4)}`.toLowerCase(),
        analyzer_name: `analyzer-${region}`,
        finding_type: isFinding ? rand(["EXTERNAL_ACCESS", "UNUSED_ACCESS"]) : "none",
        finding_description: isFinding
          ? rand([
              "Policy allows external access",
              "Cross-account access",
              "Internet-accessible resource",
              "Unused IAM role",
              "Unused IAM user",
              "Unused access key",
            ])
          : "No external access",
        resource_type: rand(resourceTypes),
        resource_arn: `arn:aws:s3:::${rand(["prod", "staging", "dev"])}-bucket`,
        principal: isFinding ? "*" : null,
        status: isFinding ? rand(["ACTIVE", "ARCHIVED"]) : "RESOLVED",
      },
    },
    event: {
      kind: isFinding ? "alert" : "event",
      outcome: isFinding ? "failure" : "success",
      category: ["configuration", "iam"],
      dataset: "aws.access_analyzer",
      provider: "access-analyzer.amazonaws.com",
    },
    message: isFinding
      ? `IAM Access Analyzer: external access found on ${rand(resourceTypes)}`
      : `Access Analyzer: no external access paths detected`,
    log: { level: isFinding ? "warn" : "info" },
    ...(isFinding
      ? {
          error: {
            code: "ExternalAccess",
            message: "External access path detected",
            type: "access",
          },
        }
      : {}),
  };
}

function generateCognitoLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const pool = rand(["us-users", "eu-users", "mobile-users", "b2b-customers"]);
  const userPoolId = `${region}_${randId(9)}`;
  const riskEvents = ["AccountTakeoverRisk", "CompromisedCredentials", "ImpossibleTravel"];
  const action = rand([
    "SignIn",
    "SignIn",
    "SignIn",
    "SignUp",
    "ForgotPassword",
    "ConfirmSignUp",
    "TokenRefresh",
    "AdminCreateUser",
    "AccountTakeoverRisk",
    "CompromisedCredentials",
    "ImpossibleTravel",
    "AdminResetPassword",
    "UserMigration",
    "TokenGeneration_HostedUI",
  ]);
  const isRiskEvent = riskEvents.includes(action);
  const user = `user-${randId(8).toLowerCase()}@example.com`;
  const signIns = randInt(100, 10000);
  const tokenRefreshes = randInt(500, 50000);
  const isAccountTakeover = action === "AccountTakeoverRisk";
  const riskLevel = rand(["HIGH", "MEDIUM", "LOW"]);
  const riskDecision =
    riskLevel === "HIGH"
      ? rand(["BLOCK", "MFA"])
      : riskLevel === "MEDIUM"
        ? rand(["MFA", "ALLOW"])
        : "ALLOW";
  const prevCountries = ["US", "GB", "DE", "FR", "JP"];
  const currCountries = ["NG", "RU", "CN", "BR", "IN"];
  const advancedSecurity = isRiskEvent
    ? {
        risk_level: riskLevel,
        risk_decision: riskDecision,
        compromised_credentials_detected: action === "CompromisedCredentials" ? true : false,
        impossible_travel: action === "ImpossibleTravel" ? true : false,
        previous_location: { ip: randIp(), country: rand(prevCountries) },
        current_location: { ip: randIp(), country: rand(currCountries) },
        time_between_events_seconds: randInt(30, 300),
      }
    : undefined;
  const logLevel =
    isAccountTakeover && riskLevel === "HIGH"
      ? "error"
      : isRiskEvent
        ? "warn"
        : isErr
          ? "warn"
          : "info";
  const errorCode = isErr
    ? rand(["NotAuthorizedException", "UserNotFoundException", "TooManyRequestsException"])
    : null;
  const actionTaken = action === "CompromisedCredentials" ? "BLOCK" : undefined;
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "cognito" },
    },
    aws: {
      dimensions: { UserPool: userPoolId, UserPoolClient: `${pool}-web` },
      cognito: {
        user_pool_id: userPoolId,
        user_pool_name: pool,
        event_type: action,
        username: isErr ? null : user,
        error_code: errorCode,
        source_ip: randIp(),
        mfa_type: Math.random() > 0.7 ? rand(["SOFTWARE_TOKEN_MFA", "SMS_MFA"]) : null,
        ...(isRiskEvent
          ? {
              risk_type: action,
              ...(actionTaken ? { action_taken: actionTaken } : {}),
            }
          : {}),
        ...(advancedSecurity ? { advanced_security: advancedSecurity } : {}),
        metrics: {
          SignInSuccesses: { sum: isErr ? 0 : signIns },
          SignInAttempts: { sum: signIns + (isErr ? randInt(10, 500) : 0) },
          TokenRefreshSuccesses: { sum: isErr ? 0 : tokenRefreshes },
          SignUpSuccesses: { sum: action === "SignUp" && !isErr ? randInt(1, 100) : 0 },
          FederationSuccesses: { sum: Math.random() > 0.8 ? randInt(1, 500) : 0 },
          CallCount: { sum: randInt(1000, 100000) },
          ThrottleCount: { sum: isErr ? randInt(1, 100) : 0 },
          AccountTakeoverRisk: {
            sum: isAccountTakeover ? randInt(1, 10) : isErr ? randInt(0, 5) : 0,
          },
          CompromisedCredentialsRisk: {
            sum: action === "CompromisedCredentials" ? randInt(1, 5) : isErr ? randInt(0, 3) : 0,
          },
        },
      },
    },
    user: { name: isErr ? null : user },
    source: { ip: randIp() },
    event: {
      action,
      outcome: isErr || (isRiskEvent && riskDecision === "BLOCK") ? "failure" : "success",
      category: ["authentication"],
      dataset: "aws.cognito",
      provider: "cognito-idp.amazonaws.com",
    },
    message: isRiskEvent
      ? `Cognito ${action} detected [${riskLevel}]: decision=${riskDecision} pool=${pool}`
      : isErr
        ? `Cognito ${action} FAILED: ${rand(["Incorrect password", "User not found", "Rate limit exceeded"])}`
        : `Cognito ${action} success [${pool}]`,
    log: { level: logLevel },
    ...(isErr
      ? { error: { code: errorCode, message: "Authentication failed", type: "authentication" } }
      : {}),
    ...(isRiskEvent && riskDecision === "BLOCK"
      ? {
          error: {
            code: action,
            message: `Cognito advanced security blocked: ${action}`,
            type: "security",
          },
        }
      : {}),
  };
}

function generateKmsLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const keyId = `${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`.toLowerCase();
  const op = rand([
    "Decrypt",
    "Encrypt",
    "GenerateDataKey",
    "Sign",
    "Verify",
    "DescribeKey",
    "EnableKeyRotation",
    "ScheduleKeyDeletion",
  ]);
  const keyAlias = rand([
    "alias/prod-s3-key",
    "alias/rds-encryption",
    "alias/backup-key",
    "alias/secrets-key",
  ]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "kms" },
    },
    aws: {
      kms: {
        key_id: keyId,
        key_alias: keyAlias,
        operation: op,
        principal_arn: `arn:aws:iam::${acct.id}:${rand(["user/alice", "role/lambda-role", "role/ecs-task-role"])}`,
        key_state: isErr ? "PendingDeletion" : "Enabled",
        encryption_algorithm: rand(["SYMMETRIC_DEFAULT", "RSAES_OAEP_SHA_256"]),
        error_code: isErr
          ? rand(["DisabledException", "AccessDeniedException", "KMSInvalidStateException"])
          : null,
        metrics: {
          SecretsManagerCrossAccountBlocking: { sum: 0 },
          KeysCount: { avg: randInt(1, 1000) },
          KeysPendingDeletion: { avg: randInt(0, 10) },
          KeysDisabled: { avg: randInt(0, 5) },
        },
      },
    },
    event: {
      action: op,
      outcome: isErr ? "failure" : "success",
      category: ["authentication", "configuration"],
      dataset: "aws.kms",
      provider: "kms.amazonaws.com",
    },
    message: isErr
      ? `KMS ${op} FAILED on ${keyAlias}: ${rand(["Key disabled", "Access denied", "Key pending deletion"])}`
      : `KMS ${op}: ${keyAlias}`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand(["DisabledException", "AccessDeniedException", "KMSInvalidStateException"]),
            message: "KMS operation failed",
            type: "access",
          },
        }
      : {}),
  };
}

function generateSecretsManagerLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const secret = rand([
    "prod/db/password",
    "prod/api/key",
    "staging/redis/auth",
    "prod/oauth/secret",
    "prod/stripe/api-key",
  ]);
  const op = rand([
    "GetSecretValue",
    "PutSecretValue",
    "RotateSecret",
    "CreateSecret",
    "DeleteSecret",
    "GetSecretValue",
    "GetSecretValue",
  ]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "secretsmanager" },
    },
    aws: {
      secretsmanager: {
        secret_name: secret,
        operation: op,
        rotation_enabled: op === "RotateSecret",
        accessed_by: rand(["lambda-function", "ecs-task", "ec2-instance", "developer"]),
        last_rotated_date: new Date(Date.now() - randInt(0, 30) * 86400000).toISOString(),
        error_code: isErr
          ? rand([
              "DecryptionFailure",
              "EncryptionFailure",
              "InternalServiceError",
              "InvalidNextTokenException",
              "InvalidParameterException",
              "InvalidRequestException",
              "LimitExceededException",
              "MalformedPolicyDocumentException",
              "PreconditionsFailedException",
              "PublicPolicyException",
              "ResourceExistsException",
              "ResourceNotFoundException",
            ])
          : null,
      },
    },
    event: {
      action: op,
      outcome: isErr ? "failure" : "success",
      category: ["authentication", "configuration"],
      dataset: "aws.secretsmanager",
      provider: "secretsmanager.amazonaws.com",
    },
    message: isErr
      ? `Secrets Manager ${op} on ${secret} FAILED: ${rand(["Access denied", "Secret not found"])}`
      : `Secrets Manager ${op}: ${secret}`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand([
              "DecryptionFailure",
              "EncryptionFailure",
              "InternalServiceError",
              "InvalidNextTokenException",
              "InvalidParameterException",
              "InvalidRequestException",
              "LimitExceededException",
              "MalformedPolicyDocumentException",
              "PreconditionsFailedException",
              "PublicPolicyException",
              "ResourceExistsException",
              "ResourceNotFoundException",
            ]),
            message: "Secrets Manager operation failed",
            type: "access",
          },
        }
      : {}),
  };
}

function generateAcmLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const domain = rand(["*.example.com", "api.example.com", "www.example.com", "*.internal.corp"]);
  const status = isErr
    ? rand(["FAILED", "REVOKED", "EXPIRED"])
    : rand(["ISSUED", "ISSUED", "PENDING_VALIDATION"]);
  const daysToExpiry = isErr ? randInt(-30, 30) : randInt(30, 365);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "acm" },
    },
    aws: {
      acm: {
        certificate_arn:
          `arn:aws:acm:${region}:${acct.id}:certificate/${randId(8)}-${randId(4)}`.toLowerCase(),
        domain_name: domain,
        status,
        type: rand(["AMAZON_ISSUED", "IMPORTED"]),
        days_to_expiry: daysToExpiry,
        key_algorithm: rand(["RSA_2048", "EC_prime256v1"]),
        validation_method: rand(["DNS", "EMAIL"]),
        renewal_status: isErr ? "FAILED" : "SUCCESS",
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: "network",
      dataset: "aws.acm",
      provider: "acm.amazonaws.com",
    },
    message: isErr
      ? `ACM certificate for ${domain}: ${status}${daysToExpiry < 0 ? ` (expired ${Math.abs(daysToExpiry)}d ago)` : ""}`
      : `ACM certificate for ${domain}: ${status}, ${daysToExpiry}d remaining`,
    log: { level: isErr ? "error" : daysToExpiry < 30 ? "warn" : "info" },
    ...(isErr
      ? {
          error: { code: status, message: `Certificate ${domain}: ${status}`, type: "certificate" },
        }
      : {}),
  };
}

function generateIamIdentityCenterLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const user = rand(["alice@corp.com", "bob@corp.com", "carol@corp.com", "svc-account@corp.com"]);
  const action = rand([
    "Authenticate",
    "Authorize",
    "ProvisionUser",
    "AssignPermissionSet",
    "RevokeAccess",
    "MFAChallenge",
  ]);
  const app = rand(["AWS Console", "Salesforce", "Slack", "GitHub Enterprise", "Jira", "DataDog"]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "identitycenter" },
    },
    aws: {
      iam_identity_center: {
        event_type: action,
        user_name: user,
        application_name: app,
        permission_set: rand([
          "AdministratorAccess",
          "ReadOnlyAccess",
          "PowerUserAccess",
          "BillingAccess",
        ]),
        account_id: `${acct.id}`,
        error_code: isErr ? rand(["AccessDeniedException", "MFARequired"]) : null,
        mfa_authenticated: Math.random() > 0.2,
      },
    },
    user: { name: user },
    source: { ip: randIp() },
    event: {
      action,
      outcome: isErr ? "failure" : "success",
      category: "authentication",
      dataset: "aws.identitycenter",
      provider: "sso.amazonaws.com",
    },
    message: isErr
      ? `IAM Identity Center ${action} FAILED for ${user} on ${app}`
      : `IAM Identity Center ${action}: ${user} -> ${app}`,
    log: { level: isErr ? "warn" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand(["AccessDeniedException", "MFARequired"]),
            message: "SSO authentication failed",
            type: "authentication",
          },
        }
      : {}),
  };
}

function generateDetectiveLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isFinding = Math.random() < er + 0.2;
  const behavior = rand([
    "Impossible Travel",
    "New ASN",
    "Unusual API Calls",
    "Credential Compromise",
    "Lateral Movement",
    "Data Exfiltration",
    "Brute Force",
  ]);
  const sev = isFinding ? rand(["CRITICAL", "HIGH", "MEDIUM"]) : "LOW";
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "detective" },
    },
    aws: {
      detective: {
        entity_type: rand(["AwsAccount", "AwsIamRole", "AwsIamUser", "Ec2Instance"]),
        entity_id: rand([
          `arn:aws:iam::${acct.id}:user/suspicious`,
          `i-${randId(17).toLowerCase()}`,
        ]),
        behavior_type: isFinding ? behavior : "Normal",
        severity_score: isFinding ? Number(randFloat(50, 99)) : Number(randFloat(0, 30)),
        finding_count: isFinding ? randInt(1, 20) : 0,
      },
    },
    event: {
      kind: isFinding ? "alert" : "event",
      outcome: isFinding ? "failure" : "success",
      category: "intrusion_detection",
      dataset: "aws.detective",
      provider: "detective.amazonaws.com",
    },
    message: isFinding
      ? `Detective [${sev}]: ${behavior} detected - ${randInt(1, 20)} related findings`
      : `Detective: entity behavior within normal baseline`,
    log: { level: sev === "CRITICAL" ? "error" : sev === "HIGH" ? "warn" : "info" },
    ...(isFinding
      ? { error: { code: "AnomalousBehavior", message: `${behavior} detected`, type: "security" } }
      : {}),
  };
}

function generateVerifiedAccessLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const user = rand([
    "alice@example.com",
    "bob@example.com",
    "carol@example.com",
    "deploy-svc@example.com",
    "contractor@partner.com",
  ]);
  const app = rand([
    "internal-dashboard",
    "admin-portal",
    "dev-tools",
    "staging-api",
    "git-server",
  ]);
  const trustProvider = rand(["iam-identity-center", "oidc-okta", "oidc-azure-ad", "oidc-okta"]);
  const devicePosture = isErr
    ? rand(["NON_COMPLIANT", "UNKNOWN"])
    : rand(["COMPLIANT", "COMPLIANT", "COMPLIANT", "UNKNOWN"]);
  const denied = isErr || devicePosture === "NON_COMPLIANT";
  const denyReason = denied
    ? rand([
        "device_compliance_check_failed",
        "mfa_required",
        "trust_provider_unavailable",
        "policy_evaluation_failed",
      ])
    : null;
  const httpMethod = rand(HTTP_METHODS);
  const httpPath = rand(HTTP_PATHS);
  const httpStatus = denied ? rand([401, 403]) : rand([200, 200, 201, 204]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "verified-access" },
    },
    aws: {
      dimensions: { ApplicationId: `va-app-${randId(8).toLowerCase()}` },
      verifiedaccess: {
        endpoint_id: `vae-${randId(17).toLowerCase()}`,
        group_id: `vag-${randId(17).toLowerCase()}`,
        instance_id: `vai-${randId(17).toLowerCase()}`,
        policy_name: rand([
          "require-mfa",
          "corporate-device",
          "require-mfa-and-device",
          "jump-server-only",
        ]),
        trust_provider_type: trustProvider,
        device_posture: devicePosture,
        verdict: denied ? "deny" : "allow",
        deny_reason: denyReason,
        http_method: httpMethod,
        http_path: httpPath,
        http_status: httpStatus,
        request_id: randUUID(),
        connection_id: randId(20),
        session_id: randId(32),
        sni_hostname: `${app}.internal.example.com`,
        application_name: app,
      },
    },
    user: { email: user, name: user.split("@")[0] },
    source: { ip: randIp() },
    event: {
      outcome: denied ? "failure" : "success",
      category: ["authentication", "network"],
      type: [denied ? "denied" : "allowed"],
      dataset: "aws.verifiedaccess",
      provider: "verified-access.amazonaws.com",
      duration: randInt(1, 200) * 1e6,
    },
    message: denied
      ? `Verified Access DENIED: ${user} -> ${app} [${denyReason}]`
      : `Verified Access allowed: ${user} -> ${app} (${devicePosture})`,
    log: { level: denied ? "warn" : "info" },
    ...(denied
      ? {
          error: {
            code: "AccessDenied",
            message: `Verified Access policy denied: ${denyReason}`,
            type: "authentication",
          },
        }
      : {}),
  };
}

function generateSecurityLakeLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const ocsfClass = rand([
    "API_ACTIVITY",
    "API_ACTIVITY",
    "NETWORK_ACTIVITY",
    "NETWORK_ACTIVITY",
    "DNS_ACTIVITY",
    "HTTP_ACTIVITY",
    "AUTHENTICATION",
    "SECURITY_FINDING",
  ]);
  const classMap = {
    API_ACTIVITY: {
      class_uid: 6003,
      class_name: "API Activity",
      category_uid: 6,
      category_name: "Application Activity",
      source_type: "LAMBDA:CloudTrail",
    },
    NETWORK_ACTIVITY: {
      class_uid: 4001,
      class_name: "Network Activity",
      category_uid: 4,
      category_name: "Network Activity",
      source_type: "LAMBDA:VpcFlow",
    },
    DNS_ACTIVITY: {
      class_uid: 4003,
      class_name: "DNS Activity",
      category_uid: 4,
      category_name: "Network Activity",
      source_type: "LAMBDA:Route53",
    },
    HTTP_ACTIVITY: {
      class_uid: 4002,
      class_name: "HTTP Activity",
      category_uid: 4,
      category_name: "Network Activity",
      source_type: "LAMBDA:ALB",
    },
    AUTHENTICATION: {
      class_uid: 3002,
      class_name: "Authentication",
      category_uid: 3,
      category_name: "Identity & Access Management Activity",
      source_type: "LAMBDA:CloudTrail",
    },
    SECURITY_FINDING: {
      class_uid: 2001,
      class_name: "Security Finding",
      category_uid: 2,
      category_name: "Findings",
      source_type: "LAMBDA:SecurityHub",
    },
  };
  const cls = classMap[ocsfClass];
  const activityId = rand([1, 2, 3, 4, 5]);
  const activityName = rand(["Create", "Read", "Update", "Delete", "Other"]);
  const severityId = isErr ? rand([5, 6]) : rand([1, 2, 3]);
  const severityName = { 1: "Informational", 2: "Low", 3: "Medium", 5: "High", 6: "Critical" }[
    severityId
  ];
  const statusId = isErr ? 2 : 1;
  const srcIp = randIp();
  const dstIp = randIp();
  const user = rand(["alice", "bob", "carol", "deploy-bot", "svc-account"]);
  let classFields = {};
  if (ocsfClass === "API_ACTIVITY") {
    classFields = {
      api: {
        operation: rand([
          "RunInstances",
          "CreateBucket",
          "AssumeRole",
          "PutObject",
          "CreateUser",
          "AttachRolePolicy",
        ]),
        service: {
          name: rand([
            "ec2.amazonaws.com",
            "s3.amazonaws.com",
            "iam.amazonaws.com",
            "sts.amazonaws.com",
          ]),
        },
        request: { uid: randUUID() },
        response: { code: isErr ? rand([401, 403, 400]) : 200 },
      },
      actor: {
        user: { uid: `arn:aws:iam::${acct.id}:user/${user}`, name: user, type: "IAMUser" },
        session: { uid: `ASIA${randId(16).toUpperCase()}`, is_mfa: Math.random() < 0.7 },
      },
      src_endpoint: { ip: srcIp },
    };
  } else if (ocsfClass === "NETWORK_ACTIVITY") {
    const proto = rand([6, 17, 1]);
    classFields = {
      src_endpoint: { ip: srcIp, port: randInt(1024, 65535) },
      dst_endpoint: { ip: dstIp, port: rand([22, 80, 443, 3306, 5432, 8080]) },
      connection_info: {
        protocol_num: proto,
        protocol_name: { 6: "TCP", 17: "UDP", 1: "ICMP" }[proto],
        direction: rand(["Inbound", "Outbound"]),
        direction_id: rand([1, 2]),
      },
      traffic: { bytes: randInt(40, 1e6), packets: randInt(1, 100) },
    };
  } else if (ocsfClass === "HTTP_ACTIVITY") {
    classFields = {
      http_request: {
        method: rand(HTTP_METHODS),
        url: { path: rand(HTTP_PATHS), hostname: `api.example.com` },
        user_agent: rand(USER_AGENTS),
      },
      http_response: { code: isErr ? rand([400, 403, 500, 503]) : rand([200, 200, 201]) },
      src_endpoint: { ip: srcIp },
      dst_endpoint: { ip: dstIp },
    };
  } else if (ocsfClass === "AUTHENTICATION") {
    classFields = {
      actor: {
        user: { name: user, uid: `arn:aws:iam::${acct.id}:user/${user}` },
        session: { is_mfa: Math.random() < 0.7, uid: `ASIA${randId(16).toUpperCase()}` },
      },
      auth_protocol: rand(["SAML", "OIDC", "IAM"]),
      src_endpoint: { ip: srcIp },
      is_mfa: Math.random() < 0.7,
    };
  } else if (ocsfClass === "SECURITY_FINDING") {
    classFields = {
      finding: {
        uid: randUUID(),
        title: rand([
          "UnauthorizedAccess:IAMUser/MaliciousIPCaller",
          "CryptoCurrency:EC2/BitcoinTool",
          "Trojan:EC2/DNSDataExfiltration",
          "Recon:EC2/PortProbeUnprotectedPort",
        ]),
        types: [rand(["TTPs/Discovery", "Effects/DataExposure", "TTPs/Initial Access"])],
        first_seen_time: new Date(new Date(ts).getTime() - randInt(1, 72) * 3600000).getTime(),
        last_seen_time: new Date(ts).getTime(),
        confidence_score: randInt(1, 100),
      },
    };
  } else if (ocsfClass === "DNS_ACTIVITY") {
    classFields = {
      query: {
        hostname: rand([
          `suspicious-${randId(8)}.io`,
          `malware-${randId(6)}.ru`,
          `normal-site.com`,
          `api.service.com`,
        ]),
        type: rand(["A", "AAAA", "CNAME", "MX", "TXT"]),
        type_id: rand([1, 28, 5, 15, 16]),
      },
      src_endpoint: { ip: srcIp },
      answers: [{ rdata: dstIp, type: "A" }],
    };
  }
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "securitylake" },
    },
    aws: {
      dimensions: { OcsfClass: cls.class_name, SourceType: cls.source_type },
      securitylake: {
        source_type: cls.source_type,
        class_uid: cls.class_uid,
        class_name: cls.class_name,
        category_uid: cls.category_uid,
        category_name: cls.category_name,
        activity_id: activityId,
        activity_name: activityName,
        severity_id: severityId,
        severity: severityName,
        status_id: statusId,
        status: statusId === 1 ? "Success" : "Failure",
        time: new Date(ts).getTime(),
        metadata: {
          version: "1.1.0",
          product: { name: cls.source_type.split(":")[1], vendor_name: "AWS" },
          uid: randUUID(),
        },
        ocsf_cloud: { provider: "AWS", account: { uid: acct.id }, region },
        ...classFields,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["intrusion_detection", "network"],
      dataset: "aws.securitylake",
      provider: "securitylake.amazonaws.com",
    },
    message: `Security Lake [${cls.class_name}/${activityName}] ${severityName}: ${cls.source_type.split(":")[1]} ${statusId === 1 ? "success" : "failure"}`,
    log: { level: severityId >= 5 ? "error" : severityId >= 3 ? "warn" : "info" },
    ...(isErr
      ? {
          error: {
            code: "SecurityEvent",
            message: `Security Lake ${cls.class_name} failure`,
            type: "security",
          },
        }
      : {}),
  };
}

function generateCloudTrailLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const user = rand(["alice", "bob", "carol", "deploy-bot", "ci-pipeline", "admin"]);
  const svcDistribution = rand(["ec2", "ec2", "ec2", "s3", "s3", "iam", "iam", "lambda", "sts"]);
  const ec2Events = rand([
    "RunInstances",
    "TerminateInstances",
    "StopInstances",
    "StartInstances",
    "DescribeInstances",
    "CreateSecurityGroup",
    "AuthorizeSecurityGroupIngress",
    "ModifyInstanceAttribute",
  ]);
  const s3Events = rand([
    "CreateBucket",
    "DeleteBucket",
    "PutBucketPolicy",
    "GetBucketAcl",
    "PutObject",
    "GetObject",
    "DeleteObject",
    "ListBuckets",
  ]);
  const iamEvents = rand([
    "CreateUser",
    "DeleteUser",
    "AttachUserPolicy",
    "DetachUserPolicy",
    "CreateRole",
    "CreatePolicy",
    "AssumeRole",
    "UpdateRole",
    "ListUsers",
    "GetUser",
    "ConsoleLogin",
  ]);
  const lambdaEvents = rand([
    "CreateFunction20150331",
    "UpdateFunctionCode20150331v2",
    "InvokeFunction",
    "DeleteFunction20150331",
    "ListFunctions20150331",
  ]);
  const svcMap = {
    ec2: { name: ec2Events, svc: "ec2.amazonaws.com" },
    s3: { name: s3Events, svc: "s3.amazonaws.com" },
    iam: {
      name: iamEvents,
      svc:
        iamEvents === "AssumeRole" || iamEvents === "ConsoleLogin"
          ? "sts.amazonaws.com"
          : "iam.amazonaws.com",
    },
    lambda: { name: lambdaEvents, svc: "lambda.amazonaws.com" },
    sts: { name: "AssumeRole", svc: "sts.amazonaws.com" },
  };
  const ev = svcMap[svcDistribution];
  const eventName = ev.name;
  const sourceIPAddress = randIp();
  const userAgent = rand(USER_AGENTS);
  const requestId =
    `${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`.toLowerCase();
  const eventType = eventName === "ConsoleLogin" ? "AwsConsoleSignIn" : "AwsApiCall";
  const readOnly = [
    "DescribeInstances",
    "GetObject",
    "ListBuckets",
    "GetBucketAcl",
    "ListUsers",
    "GetUser",
    "ListFunctions20150331",
  ].includes(eventName);
  const ctErrorCodes = [
    "AccessDenied",
    "AccessDeniedException",
    "AuthFailure",
    "InvalidClientTokenId",
    "OptInRequired",
    "RequestExpired",
    "ServiceUnavailable",
    "Throttling",
    "UnauthorizedOperation",
    "ValidationError",
    "MalformedPolicyDocumentException",
    "EntityAlreadyExistsException",
    "NoSuchEntityException",
    "LimitExceededException",
    "InvalidInputException",
    "DeleteConflictException",
  ];
  const errorCode = isErr ? rand(ctErrorCodes) : undefined;
  const isAuthEvent = ["ConsoleLogin", "AssumeRole"].includes(eventName);
  const isIamEvent = [
    "CreateUser",
    "DeleteUser",
    "AttachUserPolicy",
    "DetachUserPolicy",
    "CreateRole",
    "CreatePolicy",
    "UpdateRole",
  ].includes(eventName);
  const eventCategory = isAuthEvent
    ? ["authentication", "iam"]
    : isIamEvent
      ? ["iam"]
      : ["configuration"];
  const eventTypeMap = {
    RunInstances: ["creation"],
    TerminateInstances: ["deletion"],
    StopInstances: ["change"],
    StartInstances: ["change"],
    DescribeInstances: ["access", "info"],
    CreateSecurityGroup: ["creation"],
    AuthorizeSecurityGroupIngress: ["change"],
    ModifyInstanceAttribute: ["change"],
    CreateBucket: ["creation"],
    DeleteBucket: ["deletion"],
    PutBucketPolicy: ["change"],
    GetBucketAcl: ["access", "info"],
    PutObject: ["creation"],
    GetObject: ["access"],
    DeleteObject: ["deletion"],
    ListBuckets: ["access", "info"],
    CreateUser: ["creation"],
    DeleteUser: ["deletion"],
    AttachUserPolicy: ["change"],
    DetachUserPolicy: ["change"],
    CreateRole: ["creation"],
    CreatePolicy: ["creation"],
    AssumeRole: ["access"],
    UpdateRole: ["change"],
    ListUsers: ["access", "info"],
    GetUser: ["access", "info"],
    ConsoleLogin: ["authentication", "info"],
    CreateFunction20150331: ["creation"],
    UpdateFunctionCode20150331v2: ["change"],
    InvokeFunction: ["access"],
    DeleteFunction20150331: ["deletion"],
    ListFunctions20150331: ["access", "info"],
  };
  const evType = eventTypeMap[eventName] || ["info"];

  // Identity — arn, access key, session context
  const userArn = `arn:aws:iam::${acct.id}:user/${user}`;
  const accessKeyId = `AKIA${randId(16).toUpperCase()}`;
  const identityType = rand(["IAMUser", "AssumedRole", "Root", "AWSService", "WebIdentityUser"]);
  const roleId = `AROA${randId(16).toUpperCase()}`;
  const principalId =
    identityType === "AssumedRole" ? `${roleId}:${user}-session` : `${acct.id}:${user}`;
  const sessionContext = {
    session_issuer: {
      type: "Role",
      principal_id: roleId,
      arn: `arn:aws:iam::${acct.id}:role/service-role/execution-role`,
      account_id: acct.id,
      user_name: "execution-role",
    },
    web_id_federation_data: {},
    attributes: {
      creation_date: new Date(new Date(ts).getTime() - randInt(1, 3600) * 1000).toISOString(),
      mfa_authenticated: String(Math.random() < 0.3),
    },
  };

  // Resources affected by the event
  const newBucketName = `${acct.name}-${randId(8).toLowerCase()}`;
  const resourceMap = {
    RunInstances: [
      {
        arn: `arn:aws:ec2:${region}:${acct.id}:instance/i-${randId(17).toLowerCase()}`,
        account_id: acct.id,
        type: "AWS::EC2::Instance",
      },
    ],
    CreateBucket: [
      { arn: `arn:aws:s3:::${newBucketName}`, account_id: acct.id, type: "AWS::S3::Bucket" },
    ],
    PutObject: [{ arn: `arn:aws:s3:::prod-data`, account_id: acct.id, type: "AWS::S3::Bucket" }],
    CreateRole: [
      {
        arn: `arn:aws:iam::${acct.id}:role/new-role-${randId(6).toLowerCase()}`,
        account_id: acct.id,
        type: "AWS::IAM::Role",
      },
    ],
    CreateFunction20150331: [
      {
        arn: `arn:aws:lambda:${region}:${acct.id}:function:fn-${randId(6).toLowerCase()}`,
        account_id: acct.id,
        type: "AWS::Lambda::Function",
      },
    ],
    CreateSecurityGroup: [
      {
        arn: `arn:aws:ec2:${region}:${acct.id}:security-group/sg-${randId(8).toLowerCase()}`,
        account_id: acct.id,
        type: "AWS::EC2::SecurityGroup",
      },
    ],
  };
  const resources = resourceMap[eventName];

  // Request parameters as JSON string (keyword field in official schema)
  const reqParamsBucket = `${acct.name}-${randId(8).toLowerCase()}`;
  const reqParams = isErr
    ? undefined
    : eventName === "RunInstances"
      ? JSON.stringify({
          instanceType: "t3.medium",
          imageId: "ami-0abcdef1234567890",
          minCount: 1,
          maxCount: 1,
        })
      : eventName === "CreateBucket"
        ? JSON.stringify({
            bucketName: reqParamsBucket,
            createBucketConfiguration: { locationConstraint: region },
          })
        : eventName === "AssumeRole"
          ? JSON.stringify({
              roleArn: `arn:aws:iam::${acct.id}:role/CrossAccountRole`,
              roleSessionName: `session-${randId(8).toLowerCase()}`,
            })
          : eventName === "GetSecretValue"
            ? JSON.stringify({ secretId: `${acct.name}/prod/api-key` })
            : eventName === "PutBucketPolicy"
              ? JSON.stringify({
                  bucket: `${acct.name}-${randId(8).toLowerCase()}`,
                  policy: JSON.stringify({ Version: "2012-10-17" }),
                })
              : eventName === "PutObject"
                ? JSON.stringify({ bucketName: "prod-data", key: "uploads/file.json" })
                : undefined;

  // Response elements as JSON string
  const respInstanceId = `i-${randId(17).toLowerCase()}`;
  const responseElements = isErr
    ? JSON.stringify({ errorCode })
    : eventName === "RunInstances"
      ? JSON.stringify({
          instancesSet: {
            items: [{ instanceId: respInstanceId, currentState: { name: "pending" } }],
          },
        })
      : eventName === "CreateBucket"
        ? JSON.stringify({ location: `/${reqParamsBucket}` })
        : "null";

  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "cloudtrail" },
    },
    aws: {
      dimensions: { EventName: eventName, EventSource: ev.svc },
      cloudtrail: {
        event_version: "1.09",
        event_category: eventName === "ConsoleLogin" ? "SignIn" : "Management",
        event_type: eventType,
        request_id: requestId,
        api_version: "2012-10-17",
        management_event: true,
        read_only: readOnly,
        recipient_account_id: acct.id,
        aws_region: region,
        user_identity: {
          type: identityType,
          principal_id: principalId,
          arn: userArn,
          account_id: acct.id,
          access_key_id: accessKeyId,
          session_context: sessionContext,
        },
        ...(resources ? { resources } : {}),
        request_parameters: reqParams ?? "null",
        response_elements: isErr
          ? responseElements
          : eventName === "RunInstances" || eventName === "CreateBucket"
            ? responseElements
            : "null",
        ...(isErr
          ? {
              error_code: errorCode,
              error_message: "User is not authorized to perform this operation",
            }
          : {}),
        ...(eventName === "ConsoleLogin"
          ? {
              console_login: {
                additional_eventdata: {
                  mobile_version: false,
                  login_to: `https://${acct.id}.signin.aws.amazon.com/console`,
                  mfa_used: Math.random() < 0.8,
                },
              },
            }
          : {}),
      },
    },
    user: { name: user },
    source: {
      ip: sourceIPAddress,
      geo: {
        country_iso_code: rand(["US", "GB", "DE", "FR", "JP", "AU", "CA", "IN"]),
        city_name: rand(["Ashburn", "London", "Frankfurt", "Tokyo", "Sydney", "Toronto"]),
      },
    },
    user_agent: { original: userAgent },
    event: {
      action: eventName,
      outcome: isErr ? "failure" : "success",
      category: eventCategory,
      type: evType,
      dataset: "aws.cloudtrail",
      provider: "cloudtrail.amazonaws.com",
    },
    message: `CloudTrail: ${eventName} by ${user} from ${sourceIPAddress} - ${errorCode || "Success"}`,
    log: { level: isErr ? "warn" : "info" },
    ...(isErr
      ? {
          error: {
            code: errorCode,
            message: "User is not authorized to perform this operation",
            type: "access",
          },
        }
      : {}),
  };
}

/**
 * generateSecurityFindingChain — returns 3 linked finding documents modelling
 * the GuardDuty → Security Hub → Security Lake chain.
 *
 * Each document carries a `__dataset` field used by App.jsx for per-doc index routing.
 * Strip `__dataset` before indexing (App.jsx handles this).
 *
 * @param {string} ts  - ISO timestamp
 * @param {number} er  - error rate [0,1] (ignored; chain always produces findings)
 * @returns {Object[]} [guarddutyDoc, securityhubDoc, securitylakeDoc]
 */
function generateSecurityFindingChain(ts: string, _er: number): EcsDocument[] {
  const region = rand(REGIONS);
  const acct = randAccount();

  const severity = rand(["HIGH", "HIGH", "CRITICAL", "MEDIUM"]);
  const sevCode = severity === "CRITICAL" ? 8.0 : severity === "HIGH" ? 7.0 : 4.0;
  const sevValue = sevCode >= 7 ? "High" : "Medium";
  const findingType = rand([
    "UnauthorizedAccess:EC2/SSHBruteForce",
    "UnauthorizedAccess:IAMUser/MaliciousIPCaller.Custom",
    "CryptoCurrency:EC2/BitcoinTool.B!DNS",
    "Trojan:EC2/DNSDataExfiltration",
    "Recon:EC2/PortScan",
    "Backdoor:EC2/C&CActivity.B",
    "InitialAccess:IAMUser/AnomalousBehavior",
    "PrivilegeEscalation:IAMUser/AnomalousBehavior",
  ]);
  const detectorId = randId(32).toLowerCase();
  const gdFindingId = randId(32).toLowerCase();
  const gdArn = `arn:aws:guardduty:${region}:${acct.id}:detector/${detectorId}/finding/${gdFindingId}`;
  const shFindingId = `${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`;
  const srcIp = randIp();

  // 1. GuardDuty finding
  const gdDoc = {
    "@timestamp": ts,
    __dataset: "aws.guardduty",
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "guardduty" },
    },
    aws: {
      dimensions: { DetectorId: detectorId },
      guardduty: {
        schema_version: "2.0",
        account_id: acct.id,
        region,
        partition: "aws",
        id: gdFindingId,
        arn: gdArn,
        type: findingType,
        title: findingType.replace(/^[^:]+:/, "").replace(/[/.!]/g, " "),
        description: `GuardDuty detected suspicious activity: ${findingType}`,
        created_at: ts,
        updated_at: ts,
        severity: { code: sevCode, value: sevValue },
        confidence: Number(randFloat(70, 99)),
        resource: { type: rand(["Instance", "AccessKey", "S3Bucket"]) },
        service: {
          detector_id: detectorId,
          count: randInt(1, 100),
          archived: false,
          action: {
            action_type: rand(["NETWORK_CONNECTION", "PORT_PROBE", "DNS_REQUEST", "AWS_API_CALL"]),
          },
        },
        metrics: {
          FindingCount: { sum: randInt(1, 50) },
          HighSeverityFindingCount: { sum: sevCode >= 7 ? randInt(1, 10) : 0 },
        },
      },
    },
    source: { ip: srcIp },
    rule: { category: "intrusion_detection", name: findingType },
    event: {
      kind: "alert",
      severity: sevCode,
      outcome: "failure",
      category: ["intrusion_detection"],
      type: ["indicator"],
      dataset: "aws.guardduty",
      provider: "guardduty.amazonaws.com",
    },
    message: `GuardDuty finding [${severity}]: ${findingType}`,
    log: { level: sevCode >= 7 ? "error" : "warn" },
    error: {
      code: "ThreatFinding",
      message: `GuardDuty finding: ${findingType}`,
      type: "security",
    },
  };

  // 2. Security Hub finding — product=GuardDuty, references GuardDuty ARN
  const shSevNorm = severity === "CRITICAL" ? 90 : severity === "HIGH" ? 70 : 40;
  const shDoc = {
    "@timestamp": ts,
    __dataset: "aws.securityhub_findings",
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "securityhub" },
    },
    aws: {
      dimensions: {
        ComplianceStandard: "aws-foundational-security-best-practices",
        ControlId: "GuardDuty.1",
      },
      securityhub_findings: {
        id: shFindingId,
        aws_account_id: acct.id,
        region,
        description: `GuardDuty finding promoted to Security Hub: ${findingType}`,
        created_at: ts,
        first_observed_at: ts,
        last_observed_at: ts,
        generator: { id: "guardduty" },
        types: ["Threat Detections/Tactics/Impact"],
        compliance: { security_control_id: "GuardDuty.1", status: "FAILED" },
        severity: { label: severity, normalized: shSevNorm },
        workflow: { status: "NEW" },
        record_state: "ACTIVE",
        product: {
          arn: `arn:aws:securityhub:${region}::product/aws/guardduty`,
          name: "GuardDuty",
        },
        related_findings: [
          { id: gdArn, product_arn: `arn:aws:securityhub:${region}::product/aws/guardduty` },
        ],
        criticality: severity === "CRITICAL" ? 9 : 7,
        confidence: randInt(70, 99),
      },
    },
    rule: { id: "GuardDuty.1", name: `GuardDuty.1 — ${findingType}` },
    event: {
      kind: "alert",
      severity: shSevNorm,
      outcome: "failure",
      category: ["intrusion_detection"],
      type: ["indicator"],
      dataset: "aws.securityhub_findings",
      provider: "securityhub.amazonaws.com",
    },
    message: `Security Hub [${severity}]: GuardDuty finding forwarded — ${findingType}`,
    log: { level: severity === "CRITICAL" ? "error" : "warn" },
    error: {
      code: "ThreatFinding",
      message: `Security Hub forwarded GuardDuty finding: ${findingType}`,
      type: "security",
    },
  };

  // 3. Security Lake OCSF 2001 Security Finding — source=SecurityHub, links to SH finding
  const slSevId = severity === "CRITICAL" ? 6 : severity === "HIGH" ? 5 : 3;
  const slSevName = { 6: "Critical", 5: "High", 3: "Medium" }[slSevId];
  const slDoc = {
    "@timestamp": ts,
    __dataset: "aws.securitylake",
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "securitylake" },
    },
    aws: {
      dimensions: { OcsfClass: "Security Finding", SourceType: "LAMBDA:SecurityHub" },
      securitylake: {
        source_type: "LAMBDA:SecurityHub",
        class_uid: 2001,
        class_name: "Security Finding",
        category_uid: 2,
        category_name: "Findings",
        activity_id: 1,
        activity_name: "Create",
        severity_id: slSevId,
        severity: slSevName,
        status_id: 1,
        status: "Success",
        time: new Date(ts).getTime(),
        metadata: {
          version: "1.1.0",
          product: { name: "SecurityHub", vendor_name: "AWS" },
          uid: randUUID(),
        },
        ocsf_cloud: { provider: "AWS", account: { uid: acct.id }, region },
        finding: {
          uid: shFindingId,
          title: `GuardDuty: ${findingType}`,
          types: ["Threat Detections/Tactics/Impact"],
          first_seen_time: new Date(ts).getTime(),
          last_seen_time: new Date(ts).getTime(),
          confidence_score: randInt(70, 99),
          related_finding_uid: gdArn,
        },
        src_endpoint: { ip: srcIp },
      },
    },
    event: {
      outcome: "failure",
      category: ["intrusion_detection"],
      dataset: "aws.securitylake",
      provider: "securitylake.amazonaws.com",
    },
    message: `Security Lake [Security Finding/${slSevName}]: GuardDuty→SecurityHub chain — ${findingType}`,
    log: { level: slSevId >= 5 ? "error" : "warn" },
    error: {
      code: "SecurityFinding",
      message: `Security Lake OCSF Security Finding: ${findingType}`,
      type: "security",
    },
  };

  return [gdDoc, shDoc, slDoc];
}

// ── CSPM Findings (Elastic Cloud Security Posture Management) ─────────────────
const CIS_AWS_RULES = [
  {
    section: "1.1",
    id: "cis_1_1",
    name: "Avoid use of the root account",
    resource_type: "cloud-identity-management",
    sub_type: "iam-root",
    severity: "critical",
    tags: ["IAM"],
  },
  {
    section: "1.2",
    id: "cis_1_2",
    name: "Ensure MFA enabled for all IAM users with console access",
    resource_type: "cloud-identity-management",
    sub_type: "iam-user",
    severity: "high",
    tags: ["IAM"],
  },
  {
    section: "1.3",
    id: "cis_1_3",
    name: "Ensure no root account access key exists",
    resource_type: "cloud-identity-management",
    sub_type: "iam-root",
    severity: "critical",
    tags: ["IAM"],
  },
  {
    section: "1.8",
    id: "cis_1_8",
    name: "Ensure IAM password policy requires minimum length of 14",
    resource_type: "cloud-identity-management",
    sub_type: "iam-policy",
    severity: "medium",
    tags: ["IAM"],
  },
  {
    section: "1.14",
    id: "cis_1_14",
    name: "Ensure hardware MFA is enabled for root account",
    resource_type: "cloud-identity-management",
    sub_type: "iam-root",
    severity: "critical",
    tags: ["IAM"],
  },
  {
    section: "2.1",
    id: "cis_2_1",
    name: "Ensure CloudTrail is enabled in all regions",
    resource_type: "cloud-audit",
    sub_type: "cloudtrail",
    severity: "high",
    tags: ["Logging"],
  },
  {
    section: "2.2",
    id: "cis_2_2",
    name: "Ensure CloudTrail log file validation is enabled",
    resource_type: "cloud-audit",
    sub_type: "cloudtrail",
    severity: "medium",
    tags: ["Logging"],
  },
  {
    section: "2.4",
    id: "cis_2_4",
    name: "Ensure CloudTrail trails are encrypted with KMS CMK",
    resource_type: "cloud-audit",
    sub_type: "cloudtrail",
    severity: "medium",
    tags: ["Logging"],
  },
  {
    section: "2.5",
    id: "cis_2_5",
    name: "Ensure AWS Config is enabled in all regions",
    resource_type: "cloud-configuration",
    sub_type: "config",
    severity: "medium",
    tags: ["Config"],
  },
  {
    section: "3.3",
    id: "cis_3_3",
    name: "Ensure a log metric filter for root account usage exists",
    resource_type: "cloud-audit",
    sub_type: "cloudwatch",
    severity: "high",
    tags: ["Monitoring"],
  },
  {
    section: "4.1",
    id: "cis_4_1",
    name: "Ensure no security group allows unrestricted SSH inbound",
    resource_type: "cloud-network",
    sub_type: "security-group",
    severity: "high",
    tags: ["Networking"],
  },
  {
    section: "4.2",
    id: "cis_4_2",
    name: "Ensure no security group allows unrestricted RDP inbound",
    resource_type: "cloud-network",
    sub_type: "security-group",
    severity: "high",
    tags: ["Networking"],
  },
  {
    section: "5.1",
    id: "cis_5_1",
    name: "Ensure VPC Flow Logs are enabled in all VPCs",
    resource_type: "cloud-network",
    sub_type: "vpc",
    severity: "medium",
    tags: ["Networking"],
  },
  {
    section: "5.4",
    id: "cis_5_4",
    name: "Ensure default VPC security group restricts all traffic",
    resource_type: "cloud-network",
    sub_type: "security-group",
    severity: "medium",
    tags: ["Networking"],
  },
];

function generateCspmFindings(ts: string, er: number): EcsDocument[] {
  const region = rand(REGIONS);
  const acct = randAccount();
  const rule = rand(CIS_AWS_RULES);
  const isFailed = Math.random() < er + 0.25;
  const evaluation = isFailed ? "failed" : "passed";
  const resourceId =
    rule.sub_type === "iam-user"
      ? `arn:aws:iam::${acct.id}:user/${rand(["alice", "bob", "carol", "svc-deploy"])}`
      : rule.sub_type === "iam-root"
        ? `arn:aws:iam::${acct.id}:root`
        : rule.sub_type === "iam-policy"
          ? `arn:aws:iam::${acct.id}:policy/password-policy`
          : rule.sub_type === "cloudtrail"
            ? `arn:aws:cloudtrail:${region}:${acct.id}:trail/management-events`
            : rule.sub_type === "cloudwatch"
              ? `arn:aws:cloudwatch:${region}:${acct.id}:alarm/root-login`
              : rule.sub_type === "config"
                ? `arn:aws:config:${region}:${acct.id}:config-recorder/default`
                : rule.sub_type === "vpc"
                  ? `arn:aws:ec2:${region}:${acct.id}:vpc/vpc-${randId(8).toLowerCase()}`
                  : rule.sub_type === "security-group"
                    ? `arn:aws:ec2:${region}:${acct.id}:security-group/sg-${randId(8).toLowerCase()}`
                    : `arn:aws:${rule.sub_type}:${region}:${acct.id}:${rule.sub_type}-${randId(8).toLowerCase()}`;
  const resourceName = resourceId.split("/").pop() || resourceId.split(":").pop();
  return [
    {
      "@timestamp": ts,
      __dataset: "cloud_security_posture.findings",
      data_stream: {
        dataset: "cloud_security_posture.findings",
        namespace: "default",
        type: "logs",
      },
      cloud: { provider: "aws", region, account: { id: acct.id, name: acct.name } },
      resource: {
        id: resourceId,
        name: resourceName,
        sub_type: rule.sub_type,
        type: rule.resource_type,
      },
      rule: {
        id: rule.id,
        name: rule.name,
        section: rule.section,
        tags: rule.tags,
        benchmark: {
          id: "cis_aws",
          version: "v1.5.0",
          rule_number: rule.section,
          posture_type: "cspm",
        },
        impact: isFailed
          ? `Non-compliance with CIS AWS ${rule.section} may expose account to unauthorized access.`
          : null,
        remediation: isFailed
          ? `Remediate per CIS AWS Foundations Benchmark v1.5.0 section ${rule.section}.`
          : null,
      },
      result: { evaluation },
      severity: isFailed ? rule.severity : "none",
      event: {
        kind: "state",
        category: ["configuration"],
        type: ["info"],
        outcome: isFailed ? "failure" : "success",
        dataset: "cloud_security_posture.findings",
        provider: "elastic_cspm",
      },
      message: `CSPM [CIS AWS 1.5 / ${rule.section}] ${evaluation}: ${rule.name}`,
      log: { level: isFailed ? (rule.severity === "critical" ? "error" : "warn") : "info" },
      ...(isFailed
        ? {
            error: {
              code: `CIS_${rule.id.toUpperCase()}`,
              message: `CSPM check failed: ${rule.name}`,
              type: "compliance",
            },
          }
        : {}),
    },
  ];
}

// ── KSPM Findings (Elastic Kubernetes Security Posture Management) ────────────
const CIS_EKS_RULES = [
  {
    section: "1.1",
    id: "cis_eks_1_1",
    name: "Restrict anonymous access to the API server",
    resource_type: "k8s_object",
    sub_type: "api-server",
    severity: "critical",
    tags: ["API Server"],
  },
  {
    section: "2.1",
    id: "cis_eks_2_1",
    name: "Enable audit logging",
    resource_type: "k8s_object",
    sub_type: "api-server",
    severity: "high",
    tags: ["Logging"],
  },
  {
    section: "4.1",
    id: "cis_eks_4_1",
    name: "Prefer using secrets as files over environment variables",
    resource_type: "k8s_object",
    sub_type: "Pod",
    severity: "medium",
    tags: ["Workload"],
  },
  {
    section: "4.2",
    id: "cis_eks_4_2",
    name: "Avoid the admission of privileged containers",
    resource_type: "k8s_object",
    sub_type: "Pod",
    severity: "high",
    tags: ["Pod Security"],
  },
  {
    section: "4.3",
    id: "cis_eks_4_3",
    name: "Minimize containers wishing to share the host process ID namespace",
    resource_type: "k8s_object",
    sub_type: "Pod",
    severity: "high",
    tags: ["Pod Security"],
  },
  {
    section: "4.4",
    id: "cis_eks_4_4",
    name: "Minimize containers wishing to share the host IPC namespace",
    resource_type: "k8s_object",
    sub_type: "Pod",
    severity: "high",
    tags: ["Pod Security"],
  },
  {
    section: "4.6",
    id: "cis_eks_4_6",
    name: "Minimize the admission of root containers",
    resource_type: "k8s_object",
    sub_type: "Pod",
    severity: "medium",
    tags: ["Pod Security"],
  },
  {
    section: "5.1",
    id: "cis_eks_5_1",
    name: "Enable network policy on EKS worker nodes",
    resource_type: "k8s_object",
    sub_type: "Namespace",
    severity: "medium",
    tags: ["Policies"],
  },
  {
    section: "5.4",
    id: "cis_eks_5_4",
    name: "Restrict access to the control plane endpoint",
    resource_type: "k8s_object",
    sub_type: "api-server",
    severity: "high",
    tags: ["Managed Services"],
  },
  {
    section: "5.5",
    id: "cis_eks_5_5",
    name: "Encrypt Kubernetes Secrets at rest using AWS KMS",
    resource_type: "k8s_object",
    sub_type: "Secret",
    severity: "high",
    tags: ["Managed Services"],
  },
];
const EKS_CLUSTERS = ["prod-eks-cluster", "staging-eks", "dev-eks", "data-processing-eks"];
const EKS_NAMESPACES = [
  "default",
  "kube-system",
  "production",
  "staging",
  "monitoring",
  "logging",
  "ingress-nginx",
];

function generateKspmFindings(ts: string, er: number): EcsDocument[] {
  const region = rand(REGIONS);
  const acct = randAccount();
  const rule = rand(CIS_EKS_RULES);
  const cluster = rand(EKS_CLUSTERS);
  const ns = rand(EKS_NAMESPACES);
  const isFailed = Math.random() < er + 0.2;
  const evaluation = isFailed ? "failed" : "passed";
  const resourceName =
    rule.sub_type === "Pod"
      ? `pod/${rand(["frontend", "backend", "api-gateway", "worker", "cron"])}-${randId(5).toLowerCase()}`
      : rule.sub_type === "Node"
        ? `node/ip-${randIp().replace(/\./g, "-")}.ec2.internal`
        : rule.sub_type === "Namespace"
          ? `namespace/${ns}`
          : rule.sub_type === "Secret"
            ? `secret/app-secrets-${randId(4).toLowerCase()}`
            : `${rule.sub_type.toLowerCase()}/${cluster}`;
  const resourceId = `${cluster}/${ns}/${resourceName}`;
  return [
    {
      "@timestamp": ts,
      __dataset: "cloud_security_posture.findings",
      data_stream: {
        dataset: "cloud_security_posture.findings",
        namespace: "default",
        type: "logs",
      },
      cloud: { provider: "aws", region, account: { id: acct.id, name: acct.name } },
      orchestrator: { cluster: { id: cluster, name: cluster }, type: "kubernetes", namespace: ns },
      resource: {
        id: resourceId,
        name: resourceName,
        sub_type: rule.sub_type,
        type: rule.resource_type,
      },
      rule: {
        id: rule.id,
        name: rule.name,
        section: rule.section,
        tags: rule.tags,
        benchmark: {
          id: "cis_eks",
          version: "v1.4.0",
          rule_number: rule.section,
          posture_type: "kspm",
        },
        impact: isFailed
          ? `${rule.name} — non-compliant configuration may allow container escape or lateral movement.`
          : null,
        remediation: isFailed
          ? `Review and remediate per CIS EKS Benchmark v1.4.0 section ${rule.section}.`
          : null,
      },
      result: { evaluation },
      severity: isFailed ? rule.severity : "none",
      event: {
        kind: "state",
        category: ["configuration"],
        type: ["info"],
        outcome: isFailed ? "failure" : "success",
        dataset: "cloud_security_posture.findings",
        provider: "elastic_kspm",
      },
      message: `KSPM [CIS EKS / ${rule.section}] ${evaluation}: ${rule.name} [${cluster}]`,
      log: { level: isFailed ? (rule.severity === "critical" ? "error" : "warn") : "info" },
      ...(isFailed
        ? {
            error: {
              code: `CIS_${rule.id.toUpperCase()}`,
              message: `KSPM check failed: ${rule.name}`,
              type: "compliance",
            },
          }
        : {}),
    },
  ];
}

// ── IAM Privilege Escalation Attack Chain ─────────────────────────────────────
function generateIamPrivEscChain(ts: string, _er: number): EcsDocument[] {
  const region = rand(REGIONS);
  const acct = randAccount();
  const attacker = rand(["ci-pipeline", "deploy-bot", "svc-account", "temp-user"]);
  const targetUser = rand(["alice", "bob", "admin-user", "support-agent"]);
  const sourceIp = randIp();
  const accessKeyId = `AKIA${randId(16).toUpperCase()}`;
  const roleArn = `arn:aws:iam::${acct.id}:role/AdminRole`;
  const sessionName = `session-${randId(8).toLowerCase()}`;

  const ctBase = (
    eventName,
    requestId,
    readOnly,
    reqParams,
    respElements,
    svc = "iam.amazonaws.com"
  ) => ({
    __dataset: "aws.cloudtrail",
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "cloudtrail" },
    },
    aws: {
      dimensions: { EventName: eventName, EventSource: svc },
      cloudtrail: {
        event_version: "1.09",
        event_category: "Management",
        event_type: "AwsApiCall",
        request_id: requestId,
        management_event: true,
        read_only: readOnly,
        recipient_account_id: acct.id,
        aws_region: region,
        user_identity: {
          type: "IAMUser",
          principal_id: `AIDA${randId(16).toUpperCase()}`,
          arn: `arn:aws:iam::${acct.id}:user/${attacker}`,
          account_id: acct.id,
          access_key_id: accessKeyId,
          session_context: {
            session_issuer: null,
            web_id_federation_data: null,
            attributes: { creation_date: ts, mfa_authenticated: false },
          },
        },
        ...(reqParams ? { request_parameters: reqParams } : {}),
        response_elements: respElements,
      },
    },
    user: { name: attacker },
    source: { ip: sourceIp },
    user_agent: { original: "aws-sdk-python/1.26.0 Python/3.11 Linux/5.15 exec-env/EC2" },
    event: {
      action: eventName,
      outcome: "success",
      category: ["iam", "configuration"],
      type: ["change"],
      dataset: "aws.cloudtrail",
      provider: "cloudtrail.amazonaws.com",
    },
    log: { level: "warn" },
  });

  const doc1 = {
    ...ctBase(
      "ListUsers",
      `${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`.toLowerCase(),
      true,
      JSON.stringify({ maxItems: 100 }),
      JSON.stringify({
        users: [
          {
            arn: `arn:aws:iam::${acct.id}:user/${targetUser}`,
            userId: `AIDA${randId(16).toUpperCase()}`,
            userName: targetUser,
            path: "/",
            createDate: ts,
          },
        ],
      })
    ),
    threat: {
      tactic: { name: "Discovery", id: "TA0007" },
      technique: { name: "Cloud Infrastructure Discovery", id: "T1580" },
    },
    message: `CloudTrail [PrivEsc Step 1/4]: ListUsers by ${attacker} from ${sourceIp} — enumeration`,
  };
  const doc2 = {
    ...ctBase(
      "CreateAccessKey",
      `${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`.toLowerCase(),
      false,
      JSON.stringify({ userName: targetUser }),
      JSON.stringify({
        accessKey: {
          accessKeyId: `AKIA${randId(16).toUpperCase()}`,
          status: "Active",
          userName: targetUser,
          createDate: ts,
        },
      })
    ),
    threat: {
      tactic: { name: "Persistence", id: "TA0003" },
      technique: { name: "Create Account: Cloud Account", id: "T1136.003" },
    },
    message: `CloudTrail [PrivEsc Step 2/4]: CreateAccessKey for ${targetUser} by ${attacker} — credential creation`,
  };
  const doc3 = {
    ...ctBase(
      "AttachUserPolicy",
      `${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`.toLowerCase(),
      false,
      JSON.stringify({
        userName: targetUser,
        policyArn: "arn:aws:iam::aws:policy/AdministratorAccess",
      }),
      "null"
    ),
    threat: {
      tactic: { name: "Privilege Escalation", id: "TA0004" },
      technique: { name: "Abuse Elevation Control Mechanism", id: "T1548" },
    },
    message: `CloudTrail [PrivEsc Step 3/4]: AttachUserPolicy AdministratorAccess to ${targetUser} by ${attacker}`,
  };
  const doc4 = {
    ...ctBase(
      "AssumeRole",
      `${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`.toLowerCase(),
      false,
      JSON.stringify({ roleArn, roleSessionName: sessionName, durationSeconds: 3600 }),
      JSON.stringify({
        credentials: {
          accessKeyId: `ASIA${randId(16).toUpperCase()}`,
          expiration: new Date(new Date(ts).getTime() + 3600000).toISOString(),
        },
        assumedRoleUser: { arn: `${roleArn}/${sessionName}` },
      }),
      "sts.amazonaws.com"
    ),
    threat: {
      tactic: { name: "Lateral Movement", id: "TA0008" },
      technique: { name: "Use Alternate Authentication Material: Cloud API", id: "T1550.001" },
    },
    message: `CloudTrail [PrivEsc Step 4/4]: AssumeRole AdminRole by ${attacker} — lateral movement complete`,
    error: {
      code: "PrivilegeEscalation",
      message: `IAM privilege escalation: ${attacker} assumed AdminRole`,
      type: "security",
    },
  };
  return [doc1, doc2, doc3, doc4];
}

// ── Data Exfiltration Attack Chain ────────────────────────────────────────────
function generateDataExfilChain(ts: string, _er: number): EcsDocument[] {
  const region = rand(REGIONS);
  const acct = randAccount();
  const bucket = rand([
    "prod-customer-data",
    "financial-records",
    "hr-confidential",
    "backup-exports",
    "analytics-output",
  ]);
  const bucketName = `${bucket}-${acct.id.slice(-6)}`;
  const attackerIp = randIp();
  const detectorId = randId(32).toLowerCase();
  const gdFindingId = randId(32).toLowerCase();
  const keyCount = randInt(200, 2000);
  const megabytes = randInt(500, 50000);

  const gdDoc = {
    __dataset: "aws.guardduty",
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "guardduty" },
    },
    aws: {
      dimensions: { DetectorId: detectorId },
      guardduty: {
        schema_version: "2.0",
        account_id: acct.id,
        region,
        partition: "aws",
        id: gdFindingId,
        arn: `arn:aws:guardduty:${region}:${acct.id}:detector/${detectorId}/finding/${gdFindingId}`,
        type: "Exfiltration:S3/MaliciousIPCaller",
        title: "S3 object accessed from a known malicious IP",
        description: `S3 bucket ${bucketName} was accessed by ${attackerIp}, an IP associated with known threat actors`,
        created_at: ts,
        updated_at: ts,
        severity: { code: 7.0, value: "High" },
        confidence: Number(randFloat(75, 95)),
        resource: { type: "S3Bucket", s3_bucket_detail: { name: bucketName, type: "Destination" } },
        service: {
          detector_id: detectorId,
          count: keyCount,
          archived: false,
          action: {
            action_type: "AWS_API_CALL",
            aws_api_call_action: {
              api: "GetObject",
              caller_type: "Remote IP",
              remote_ip_details: { ip_address_v4: attackerIp },
            },
          },
        },
        metrics: {
          FindingCount: { sum: randInt(1, 20) },
          HighSeverityFindingCount: { sum: randInt(1, 5) },
        },
      },
    },
    source: { ip: attackerIp },
    rule: { category: "exfiltration", name: "Exfiltration:S3/MaliciousIPCaller" },
    threat: {
      tactic: { name: "Exfiltration", id: "TA0010" },
      technique: { name: "Transfer Data to Cloud Account", id: "T1537" },
      indicator: [{ type: "ip", value: attackerIp }],
    },
    event: {
      kind: "alert",
      severity: 7,
      outcome: "failure",
      category: ["intrusion_detection"],
      type: ["indicator"],
      dataset: "aws.guardduty",
      provider: "guardduty.amazonaws.com",
    },
    message: `GuardDuty [HIGH]: Exfiltration:S3/MaliciousIPCaller — s3://${bucketName} from ${attackerIp}`,
    log: { level: "error" },
    error: {
      code: "ExfiltrationDetected",
      message: `S3 data exfiltration from ${bucketName}`,
      type: "security",
    },
  };

  const ctDoc = {
    __dataset: "aws.cloudtrail",
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "cloudtrail" },
    },
    aws: {
      dimensions: { EventName: "GetObject", EventSource: "s3.amazonaws.com" },
      cloudtrail: {
        event_version: "1.09",
        event_category: "Data",
        event_type: "AwsApiCall",
        request_id:
          `${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`.toLowerCase(),
        management_event: false,
        read_only: true,
        recipient_account_id: acct.id,
        aws_region: region,
        user_identity: {
          type: "AWSAccount",
          principal_id: `ASIA${randId(16).toUpperCase()}`,
          arn: `arn:aws:sts::${acct.id}:assumed-role/ExternalRole/session-${randId(8).toLowerCase()}`,
          account_id: acct.id,
          access_key_id: `ASIA${randId(16).toUpperCase()}`,
          session_context: {
            session_issuer: null,
            web_id_federation_data: null,
            attributes: { creation_date: ts, mfa_authenticated: false },
          },
        },
        resources: [
          { ARN: `arn:aws:s3:::${bucketName}`, accountId: acct.id, type: "AWS::S3::Object" },
        ],
        request_parameters: JSON.stringify({
          bucketName,
          key: `data/export-${randId(8).toLowerCase()}.csv`,
        }),
        additional_event_count: keyCount,
      },
    },
    source: { ip: attackerIp },
    threat: { tactic: { name: "Exfiltration", id: "TA0010" } },
    event: {
      action: "GetObject",
      outcome: "success",
      category: ["file"],
      type: ["access"],
      dataset: "aws.cloudtrail",
      provider: "cloudtrail.amazonaws.com",
    },
    message: `CloudTrail [Data Exfil]: ${keyCount} S3 GetObject calls on s3://${bucketName} from ${attackerIp}`,
    log: { level: "warn" },
  };

  const vpcDoc = {
    __dataset: "aws.vpcflow",
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "vpc" },
    },
    aws: {
      vpcflow: {
        version: "5",
        account_id: acct.id,
        interface_id: `eni-${randId(8).toLowerCase()}`,
        source_ip: randIp(),
        destination_ip: attackerIp,
        source_port: 443,
        destination_port: randInt(1024, 65535),
        protocol: 6,
        packets: randInt(5000, 100000),
        bytes: megabytes * 1024 * 1024,
        start: Math.floor(new Date(ts).getTime() / 1000) - 300,
        end: Math.floor(new Date(ts).getTime() / 1000),
        action: "ACCEPT",
        log_status: "OK",
        vpc_id: `vpc-${randId(8).toLowerCase()}`,
        subnet_id: `subnet-${randId(8).toLowerCase()}`,
        tcp_flags: 18,
        type: "IPv4",
        traffic_path: rand([2, 7]),
      },
    },
    source: { ip: randIp(), port: 443, bytes: megabytes * 1024 * 1024 },
    destination: { ip: attackerIp, port: randInt(1024, 65535) },
    network: {
      bytes: megabytes * 1024 * 1024,
      packets: randInt(5000, 100000),
      transport: "tcp",
      direction: "egress",
    },
    threat: { tactic: { name: "Exfiltration", id: "TA0010" } },
    event: {
      action: "ACCEPT",
      outcome: "success",
      category: ["network"],
      type: ["connection"],
      dataset: "aws.vpcflow",
      provider: "ec2.amazonaws.com",
    },
    message: `VPC Flow [Egress]: ${megabytes}MB to ${attackerIp} — potential data exfiltration from s3://${bucketName}`,
    log: { level: "error" },
    error: {
      code: "HighEgressBytes",
      message: `${megabytes}MB egress to external IP ${attackerIp}`,
      type: "network",
    },
  };

  return [gdDoc, ctDoc, vpcDoc];
}

function generateSecurityIrLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const caseId = `case-${randId(8).toLowerCase()}`;
  const caseTitle = rand([
    "Unauthorized API access",
    "Credential compromise",
    "S3 data exposure",
    "Ransomware detection",
    "Insider threat",
  ]);
  const severity = rand(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);
  const status = isErr
    ? rand(["FAILED", "CLOSED_WITH_UNRESOLVED_ITEMS"])
    : rand(["ACTIVE", "INVESTIGATION", "CONTAINMENT", "ERADICATION", "RECOVERY", "POST_INCIDENT"]);
  const impactedAccts = randInt(1, 10);
  const impactedServices = rand([
    "EC2,S3,IAM",
    "Lambda,DynamoDB",
    "RDS,Secrets Manager",
    "ECS,ECR",
    "CloudTrail,GuardDuty",
  ]);
  const action = rand([
    "CreateCase",
    "UpdateCase",
    "CloseCase",
    "AddCaseMember",
    "CreateCaseComment",
    "UpdateResolverType",
  ]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "securityir" },
    },
    aws: {
      dimensions: { CaseId: caseId, Severity: severity },
      securityir: {
        case_id: caseId,
        case_title: caseTitle,
        case_status: status,
        severity,
        impacted_account_count: impactedAccts,
        impacted_services: impactedServices,
        resolver_type: rand(["AWS", "SELF_MANAGED", "THIRD_PARTY"]),
        engagement_type: rand(["SECURITY_INCIDENT", "INVESTIGATION", "COMPROMISE_ASSESSMENT"]),
        case_arn: `arn:aws:security-ir:${region}:${acct.id}:case/${caseId}`,
      },
    },
    event: {
      action,
      outcome: isErr ? "failure" : "success",
      category: ["intrusion_detection", "process"],
      dataset: "aws.securityir",
      provider: "security-ir.amazonaws.com",
    },
    message: isErr
      ? `Security IR ${action} FAILED [${caseId}]: ${rand(["Access denied", "Case not found", "Invalid state transition"])}`
      : `Security IR ${action}: case=${caseId} severity=${severity} status=${status}`,
    log: {
      level: severity === "CRITICAL" || severity === "HIGH" ? "error" : isErr ? "error" : "warn",
    },
    ...(isErr
      ? {
          error: {
            code: rand([
              "AccessDeniedException",
              "ResourceNotFoundException",
              "ValidationException",
            ]),
            message: "Security IR operation failed",
            type: "security",
          },
        }
      : {}),
  };
}

function generateCloudHsmLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const clusterId = `cluster-${randId(10).toLowerCase()}`;
  const hsmId = `hsm-${randId(10).toLowerCase()}`;
  const hsmState = isErr ? rand(["DEGRADED", "DELETED"]) : rand(["ACTIVE", "CREATE_IN_PROGRESS"]);
  const action = rand([
    "CreateHsm",
    "DeleteHsm",
    "InitializeCluster",
    "ActivateCluster",
    "DescribeBackups",
    "CreateBackup",
    "DeleteBackup",
    "UntagResource",
  ]);
  const keyType = rand(["AES_128", "AES_256", "RSA_2048", "RSA_4096", "EC_P256", "EC_P384"]);
  const availabilityZone = `${region}${rand(["a", "b", "c"])}`;
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "cloudhsm" },
      availability_zone: availabilityZone,
    },
    aws: {
      dimensions: { ClusterId: clusterId },
      cloudhsm: {
        cluster_id: clusterId,
        hsm_id: hsmId,
        hsm_state: hsmState,
        availability_zone: availabilityZone,
        subnet_id: `subnet-${randId(8).toLowerCase()}`,
        eni_ip: `10.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`,
        key_type: keyType,
        operation_type: rand([
          "key_generation",
          "key_usage",
          "key_deletion",
          "backup",
          "restore",
          "cluster_management",
        ]),
        backup_id: action.includes("Backup") ? `backup-${randId(10).toLowerCase()}` : null,
      },
    },
    event: {
      action,
      outcome: isErr ? "failure" : "success",
      category: ["process", "authentication"],
      dataset: "aws.cloudhsm",
      provider: "cloudhsm.amazonaws.com",
    },
    message: isErr
      ? `CloudHSM ${action} FAILED [${clusterId}]: ${rand(["HSM not reachable", "Cluster not initialized", "Backup failed", "Access denied"])}`
      : `CloudHSM ${action}: cluster=${clusterId}, hsm=${hsmId}, state=${hsmState}`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand([
              "CloudHsmAccessDeniedException",
              "CloudHsmResourceNotFoundException",
              "CloudHsmServiceException",
            ]),
            message: "CloudHSM operation failed",
            type: "security",
          },
        }
      : {}),
  };
}

function generateAuditManagerLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const assessment = rand([
    "SOC2-Type-II",
    "PCI-DSS-v4",
    "CIS-AWS-Foundations",
    "HIPAA-Readiness",
    "NIST-800-53",
  ]);
  const controlId = `CTRL-${randInt(1000, 9999)}`;
  const controlSet = rand([
    "Access Control",
    "Logging and Monitoring",
    "Data Protection",
    "Incident Response",
    "Change Management",
  ]);
  const evidenceStatus = isErr
    ? rand(["NON_COMPLIANT", "INSUFFICIENT_EVIDENCE"])
    : rand(["COMPLIANT", "COMPLIANT", "COMPLIANT", "MANUAL_EVIDENCE_NEEDED"]);
  const action = rand([
    "CreateAssessment",
    "CollectEvidence",
    "ReviewEvidence",
    "GenerateReport",
    "SubmitReviewRequest",
    "AssociateControl",
    "UpdateAssessmentControl",
  ]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "auditmanager" },
    },
    aws: {
      dimensions: { AssessmentName: assessment, ControlSetId: controlSet },
      auditmanager: {
        assessment_name: assessment,
        assessment_id: randUUID(),
        control_set: controlSet,
        control_id: controlId,
        evidence_status: evidenceStatus,
        data_source: rand(["AWS_CONFIG", "AWS_CLOUDTRAIL", "AWS_SECURITY_HUB", "MANUAL"]),
        evidence_count: randInt(1, 50),
        compliance_check: rand(["PASSED", "PASSED", "FAILED", "WARNING"]),
        reviewer: rand(["auto-assessment", "compliance-team", "security-ops"]),
      },
    },
    event: {
      action,
      outcome: isErr ? "failure" : "success",
      category: ["audit"],
      dataset: "aws.auditmanager",
      provider: "auditmanager.amazonaws.com",
    },
    message: isErr
      ? `Audit Manager ${assessment} — ${controlId} ${evidenceStatus}: insufficient evidence in ${controlSet}`
      : `Audit Manager ${assessment} — ${controlId} ${evidenceStatus}`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand([
              "ResourceNotFoundException",
              "ValidationException",
              "AccessDeniedException",
            ]),
            message: "Audit Manager evidence collection failed",
            type: "audit",
          },
        }
      : {}),
  };
}

function generateVerifiedPermissionsLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const policyStoreId = `EFxH${randId(20)}`;
  const principalType = rand(["User", "Group", "Role", "ServiceAccount"]);
  const principalId = `${principalType.toLowerCase()}-${randId(8)}`;
  const actionId = rand([
    "ReadDocument",
    "WriteDocument",
    "DeleteDocument",
    "AdminAccess",
    "ListResources",
    "InvokeAPI",
  ]);
  const resourceType = rand(["Document", "Record", "Endpoint", "Resource"]);
  const decision = isErr ? "DENY" : rand(["ALLOW", "ALLOW", "ALLOW", "DENY"]);
  const action = rand([
    "IsAuthorized",
    "IsAuthorizedWithToken",
    "GetAuthorization",
    "BatchIsAuthorized",
  ]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "verifiedpermissions" },
    },
    aws: {
      dimensions: { PolicyStoreId: policyStoreId },
      verifiedpermissions: {
        policy_store_id: policyStoreId,
        principal_entity_type: principalType,
        principal_entity_id: principalId,
        action_id: actionId,
        resource_type: resourceType,
        decision,
        determining_policies: randInt(1, 5),
        errors_count: isErr ? randInt(1, 3) : 0,
        evaluation_time_ms: randInt(1, 50),
      },
    },
    event: {
      action,
      outcome: isErr ? "failure" : "success",
      category: ["authentication", "iam"],
      dataset: "aws.verifiedpermissions",
      provider: "verifiedpermissions.amazonaws.com",
    },
    message: isErr
      ? `Verified Permissions DENY: ${principalType}/${principalId} → ${actionId} on ${resourceType}`
      : `Verified Permissions ${decision}: ${principalType}/${principalId} → ${actionId}`,
    log: { level: isErr ? "error" : decision === "DENY" ? "warn" : "info" },
    ...(decision === "DENY"
      ? {
          error: {
            code: "AccessDenied",
            message: `Authorization denied for ${principalType}/${principalId} to perform ${actionId}`,
            type: "authorization",
          },
        }
      : {}),
  };
}

function generatePaymentCryptographyLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const keyArn = `arn:aws:payment-cryptography:${region}:${acct.id}:key/${randId(36)}`;
  const keyAlgorithm = rand(["TDES_3KEY", "AES_128", "AES_192", "AES_256", "RSA_2048"]);
  const keyUsage = rand([
    "TR31_P0_PIN_ENCRYPTION_KEY",
    "TR31_C0_CARD_VERIFICATION_KEY",
    "TR31_B0_BASE_DERIVATION_KEY",
    "TR31_M3_ISO_9797_3_MAC_KEY",
  ]);
  const operation = rand([
    "GeneratePinData",
    "TranslatePinData",
    "VerifyPinData",
    "GenerateMac",
    "VerifyMac",
    "EncryptData",
    "DecryptData",
  ]);
  const keyState = isErr ? rand(["PENDING_DELETE", "DELETE_PENDING"]) : "CREATE_COMPLETE";
  const action = rand([
    "GeneratePinData",
    "TranslatePinData",
    "VerifyPinData",
    "GenerateMac",
    "VerifyMac",
    "EncryptData",
    "DecryptData",
    "ImportKey",
    "ExportKey",
    "DeleteKey",
  ]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "paymentcryptography" },
    },
    aws: {
      dimensions: { KeyAlgorithm: keyAlgorithm, Operation: operation },
      paymentcryptography: {
        key_arn: keyArn,
        key_alias: `alias/payment-${rand(["pin", "mac", "cvv", "dek"])}-key`,
        key_algorithm: keyAlgorithm,
        key_usage: keyUsage,
        operation,
        key_state: keyState,
        exportable: false,
        key_check_value: randId(6).toUpperCase(),
      },
    },
    event: {
      action,
      outcome: isErr ? "failure" : "success",
      category: ["authentication"],
      dataset: "aws.paymentcryptography",
      provider: "payment-cryptography.amazonaws.com",
    },
    message: isErr
      ? `Payment Cryptography ${operation} failed — key ${keyAlgorithm} state ${keyState}`
      : `Payment Cryptography ${operation} using ${keyAlgorithm} (${keyUsage.split("_")[1]})`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand([
              "ResourceNotFoundException",
              "ValidationException",
              "AccessDeniedException",
            ]),
            message: "Payment Cryptography operation failed",
            type: "authentication",
          },
        }
      : {}),
  };
}

function generateArtifactLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const reportName = rand([
    "SOC2-Type-II",
    "PCI-DSS-Attestation",
    "ISO-27001",
    "FedRAMP-Moderate",
    "GDPR-DPA",
    "HIPAA-BAA",
  ]);
  const reportCategory = rand(["Certification", "Attestation", "Agreement", "Regulation"]);
  const agreementName = rand([
    "Business-Associate-Agreement",
    "GDPR-Data-Processing-Addendum",
    "Non-Disclosure-Agreement",
  ]);
  const action = rand([
    "GetReport",
    "GetReportMetadata",
    "ListReports",
    "GetTermsForReport",
    "AcceptAgreement",
    "TerminateAgreement",
    "ListAgreements",
  ]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "artifact" },
    },
    aws: {
      dimensions: { ReportName: reportName, ReportCategory: reportCategory },
      artifact: {
        report_name: reportName,
        report_arn: `arn:aws:artifact:::report/${reportName.toLowerCase()}`,
        report_category: reportCategory,
        report_period: rand(["2024", "2024-Q4", "2025-H1"]),
        agreement_name: agreementName,
        agreement_type: rand(["CUSTOM", "DEFAULT"]),
        accessed_by: acct.name,
        download_format: rand(["PDF", "ZIP"]),
      },
    },
    event: {
      action,
      outcome: isErr ? "failure" : "success",
      category: ["audit"],
      dataset: "aws.artifact",
      provider: "artifact.amazonaws.com",
    },
    message: isErr
      ? `Artifact: access denied to ${reportName} for ${acct.name}`
      : `Artifact: ${action} — ${reportName} (${reportCategory})`,
    log: { level: isErr ? "error" : "info" },
    user: { name: acct.name },
    ...(isErr
      ? {
          error: {
            code: rand([
              "ResourceNotFoundException",
              "AccessDeniedException",
              "ValidationException",
            ]),
            message: "Artifact report access denied",
            type: "audit",
          },
        }
      : {}),
  };
}

// ─── Network Access Analyzer ──────────────────────────────────────────────
function generateNetworkAccessAnalyzerLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const scopes = [
    "internet-reachability",
    "cross-vpc-access",
    "vpc-peering-paths",
    "transit-gateway-routes",
  ];
  const scope = rand(scopes);
  const findings = [
    "InternetAccess",
    "CrossVpcAccess",
    "UnexpectedPeeringRoute",
    "OverlyPermissiveSecurityGroup",
    "UnreachableResource",
  ];
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "network-access-analyzer" },
    },
    aws: {
      network_access_analyzer: {
        scope_id: `naa-scope-${randId(8).toLowerCase()}`,
        scope_name: scope,
        analysis_id: `naa-analysis-${randId(12).toLowerCase()}`,
        finding_type: rand(findings),
        finding_count: isErr ? randInt(5, 50) : randInt(0, 3),
        resources_analyzed: randInt(50, 500),
        paths_found: randInt(0, isErr ? 20 : 5),
        source_vpc: `vpc-${randId(8).toLowerCase()}`,
        destination_resource: `arn:aws:ec2:${region}:${acct.id}:instance/i-${randId(17).toLowerCase()}`,
        protocol: rand(["tcp", "udp", "icmp"]),
        port_range: `${randInt(1, 1024)}-${randInt(1025, 65535)}`,
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(5e6, 3e8) },
    message: isErr
      ? `Network Access Analyzer: ${scope} — ${randInt(5, 50)} findings detected`
      : `Network Access Analyzer: ${scope} analysis complete (${randInt(50, 500)} resources)`,
  };
}

// ─── Incident Manager ─────────────────────────────────────────────────────
function generateIncidentManagerLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const plans = [
    "high-severity-incident",
    "database-outage",
    "security-breach",
    "service-degradation",
  ];
  const plan = rand(plans);
  const events = [
    "CreateIncident",
    "UpdateIncident",
    "ResolveIncident",
    "TriggerRunbook",
    "AddTimeline",
    "CreateContactChannel",
    "StartEngagement",
  ];
  const ev = rand(events);
  const impacts = [1, 2, 3, 4, 5];
  const statuses = isErr ? ["OPEN", "OPEN"] : ["OPEN", "RESOLVED"];
  const errMsgs = [
    "Runbook execution failed",
    "Contact channel unreachable",
    "Engagement timed out",
    "SSM automation error",
  ];
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "incident-manager" },
    },
    aws: {
      incident_manager: {
        response_plan: plan,
        incident_id: `inc-${randId(10).toLowerCase()}`,
        event_type: ev,
        impact: rand(impacts),
        status: rand(statuses),
        title: `${plan.replace(/-/g, " ")} — auto-detected`,
        runbook_arn: `arn:aws:ssm:${region}:${acct.id}:automation-definition/${plan}-runbook`,
        engagements: randInt(0, 5),
        timeline_events: randInt(1, 20),
        related_items: randInt(0, 10),
        duration_minutes: randInt(5, isErr ? 480 : 120),
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e5, 2.88e10) },
    message: isErr
      ? `Incident Manager: ${ev} failed for ${plan} — ${rand(errMsgs)}`
      : `Incident Manager: ${ev} on incident ${plan}`,
  };
}

export {
  generateGuardDutyLog,
  generateSecurityHubLog,
  generateMacieLog,
  generateInspectorLog,
  generateConfigLog,
  generateAccessAnalyzerLog,
  generateCognitoLog,
  generateKmsLog,
  generateSecretsManagerLog,
  generateAcmLog,
  generateIamIdentityCenterLog,
  generateDetectiveLog,
  generateCloudTrailLog,
  generateVerifiedAccessLog,
  generateSecurityLakeLog,
  generateSecurityFindingChain,
  generateCspmFindings,
  generateKspmFindings,
  generateIamPrivEscChain,
  generateDataExfilChain,
  generateSecurityIrLog,
  generateCloudHsmLog,
  generateAuditManagerLog,
  generateVerifiedPermissionsLog,
  generatePaymentCryptographyLog,
  generateArtifactLog,
  generateNetworkAccessAnalyzerLog,
  generateIncidentManagerLog,
};
