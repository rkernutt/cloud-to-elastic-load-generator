import {
  type EcsDocument,
  rand,
  randInt,
  randId,
  randFloat,
  randIp,
  gcpCloud,
  makeGcpSetup,
  randPrincipal,
  randGkeCluster,
  randGkeNamespace,
  randLatencyMs,
  randSeverity,
  randBucket,
} from "./helpers.js";

export function generateSecurityCommandCenterLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const findingId = `organizations/${randInt(1, 9)}/sources/${randId(8)}/findings/${randUUIDLike()}`;
  const category = rand([
    "OPEN_FIREWALL",
    "PUBLIC_BUCKET",
    "MFA_NOT_ENFORCED",
    "MALWARE",
    "BRUTE_FORCE",
    "WEAK_SSL_CIPHER",
    "ADMIN_SERVICE_ACCOUNT",
    "SQL_INJECTION",
    "CRYPTOMINING",
  ]);
  const severity = rand(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);
  const resourceName = rand([
    `//compute.googleapis.com/projects/${project.id}/zones/${region}-a/instances/api-${randId(4)}`,
    `//storage.googleapis.com/projects/_/buckets/${randBucket()}`,
    `//cloudsql.googleapis.com/projects/${project.id}/instances/db-${randId(4)}`,
  ]);
  const resourceType = rand(["compute.googleapis.com/Instance", "storage.googleapis.com/Bucket", "sqladmin.googleapis.com/Instance"]);
  const state = rand(["ACTIVE", "INACTIVE", "MUTED"]);
  const source = rand([
    "SECURITY_HEALTH_ANALYTICS",
    "EVENT_THREAT_DETECTION",
    "CONTAINER_THREAT_DETECTION",
    "WEB_SECURITY_SCANNER",
  ]);
  const durationNs = randLatencyMs(120, isErr) * 1e6;
  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "security-command-center"),
    gcp: {
      security_command_center: {
        finding_id: findingId,
        category,
        severity: isErr ? "HIGH" : severity,
        resource_name: resourceName,
        resource_type: resourceType,
        state,
        source,
        organization_id: `organizations/${randInt(100000, 999999)}`,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: durationNs,
    },
    message: isErr
      ? `SCC failed to update finding state for ${category} on ${resourceName}: permission denied`
      : `SCC ${source}: ${severity} finding ${category} on ${resourceType} (${state})`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            type: "PermissionDenied",
            message: "Caller lacks securitycenter.findings.update permission",
          },
        }
      : {}),
  };
}

function randUUIDLike(): string {
  return `${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`.toLowerCase();
}

export function generateIamLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const principal = randPrincipal(project);
  const action = rand(["SetIamPolicy", "CreateServiceAccountKey", "roles.create", "DeleteServiceAccount", "AddIamBinding"]);
  const resource = rand([
    `projects/${project.id}`,
    `projects/${project.id}/serviceAccounts/sa@${project.id}.iam.gserviceaccount.com`,
    `//storage.googleapis.com/projects/_/buckets/${randBucket()}`,
  ]);
  const permissionGranted = !isErr && Math.random() > 0.35;
  const policyDeltaAction = rand(["ADD", "REMOVE"]);
  const role = rand(["roles/owner", "roles/editor", "roles/storage.admin", "roles/iam.serviceAccountTokenCreator", "roles/bigquery.dataEditor"]);
  const durationNs = randLatencyMs(45, isErr) * 1e6;
  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "iam"),
    gcp: {
      iam: {
        principal,
        action,
        resource,
        permission_granted: permissionGranted,
        policy_delta_action: policyDeltaAction,
        role,
        request_id: randId(16).toLowerCase(),
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: durationNs,
    },
    message: isErr
      ? `IAM ${action} denied for ${principal} on ${resource}: insufficient privileges`
      : `IAM ${action} by ${principal} on ${resource}: ${policyDeltaAction} binding ${role}`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            type: "PermissionDenied",
            message: `Principal ${principal} is not authorized to perform ${action}`,
          },
        }
      : {}),
  };
}

export function generateSecretManagerLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const secretName = `projects/${project.id}/secrets/${rand(["api-key", "db-creds", "jwt-signing", "webhook-hmac", "tls-bundle"])}-${randId(4)}`;
  const version = `projects/${project.id}/secrets/${secretName.split("/").pop()}/versions/${randInt(1, 12)}`;
  const action = rand(["ACCESS", "ADD_VERSION", "DESTROY", "ENABLE", "DISABLE"]);
  const accessor = randPrincipal(project);
  const durationNs = randLatencyMs(25, isErr) * 1e6;
  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "secret-manager"),
    gcp: {
      secret_manager: {
        secret_name: secretName,
        version,
        action,
        accessor,
        replication: rand(["automatic", "user_managed"]),
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: durationNs,
    },
    message: isErr
      ? `Secret Manager ${action} failed for ${secretName}: accessor ${accessor} denied`
      : `Secret Manager: ${action} on ${secretName} by ${accessor}`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            type: "PermissionDenied",
            message: "Secret payload access denied by IAM policy",
          },
        }
      : {}),
  };
}

export function generateCloudKmsLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const keyRing = rand(["prod-keys", "payment-hsm", "data-encryption", "signing-keys"]);
  const cryptoKey = rand(["disk-encryption", "backup-dek", "jwt-signing", "tls-cert"]);
  const version = randInt(1, 8);
  const operation = rand(["Encrypt", "Decrypt", "Sign", "Verify", "CreateCryptoKey", "RotateKey"]);
  const algorithm = rand([
    "GOOGLE_SYMMETRIC_ENCRYPTION",
    "RSA_SIGN_PSS_2048_SHA256",
    "RSA_SIGN_PKCS1_4096_SHA512",
    "EC_SIGN_P256_SHA256",
    "AES_256_GCM",
  ]);
  const durationNs = randLatencyMs(8, isErr) * 1e6;
  const keyPath = `projects/${project.id}/locations/${region}/keyRings/${keyRing}/cryptoKeys/${cryptoKey}`;
  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "cloud-kms"),
    gcp: {
      cloud_kms: {
        key_ring: keyRing,
        crypto_key: cryptoKey,
        version,
        operation,
        algorithm,
        key_name: `${keyPath}/cryptoKeyVersions/${version}`,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: durationNs,
    },
    message: isErr
      ? `Cloud KMS ${operation} failed for ${keyPath}: key version state invalid`
      : `Cloud KMS ${operation} succeeded (${algorithm}) on ${cryptoKey} v${version}`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            type: "FailedPrecondition",
            message: "Crypto key version is not enabled for requested operation",
          },
        }
      : {}),
  };
}

export function generateCertificateAuthorityLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const caPool = rand(["internal-pki", "mesh-ca", "workload-identity"]);
  const caName = rand(["root-ca", "intermediate-prod", "dev-subordinate"]);
  const certificateId = randId(12).toLowerCase();
  const operation = rand(["IssueCertificate", "RevokeCertificate", "EnableCA", "DisableCA"]);
  const validityDays = randInt(30, 397);
  const keyAlgorithm = rand(["RSA_PKCS1_2048_SHA256", "EC_P256_SHA256", "RSA_PKCS1_4096_SHA256"]);
  const durationNs = randLatencyMs(200, isErr) * 1e6;
  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "certificate-authority-service"),
    gcp: {
      certificate_authority: {
        ca_pool: caPool,
        ca_name: caName,
        certificate_id: certificateId,
        operation,
        validity_days: validityDays,
        key_algorithm: keyAlgorithm,
        location: region,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: durationNs,
    },
    message: isErr
      ? `Private CA ${operation} failed for cert ${certificateId}: CA pool policy rejected request`
      : `Private CA ${operation}: issued cert ${certificateId} (${validityDays}d, ${keyAlgorithm})`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            type: "InvalidArgument",
            message: "Certificate template does not allow requested SANs",
          },
        }
      : {}),
  };
}

export function generateBeyondCorpLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const appConnector = rand(["connector-use1-a", "connector-ew1-b", "corp-edge-1"]);
  const application = rand(["erp.globex.internal", "gitlab.globex.io", "jira.globex.io", "wiki.globex.io"]);
  const userEmail = rand(["alice@globex.example.com", "bob@globex.example.com", "contractor@partner.example.com"]);
  const deviceTrustLevel = rand(["TRUST", "UNTRUST"]);
  const accessDecision = isErr ? "DENY" : rand(["ALLOW", "DENY"]);
  const policyName = rand(["corp-baseline", "vendor-restricted", "break-glass-admin"]);
  const durationNs = randLatencyMs(35, isErr) * 1e6;
  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "beyondcorp"),
    gcp: {
      beyondcorp: {
        app_connector: appConnector,
        application,
        user_email: userEmail,
        device_trust_level: deviceTrustLevel,
        access_decision: accessDecision,
        policy_name: policyName,
      },
    },
    event: {
      outcome: accessDecision === "ALLOW" && !isErr ? "success" : "failure",
      duration: durationNs,
    },
    message: isErr
      ? `BeyondCorp policy evaluation failed for ${application}: connector ${appConnector} unreachable`
      : `BeyondCorp ${accessDecision}: ${userEmail} → ${application} via ${appConnector} (device ${deviceTrustLevel})`,
    log: { level: isErr || accessDecision === "DENY" ? "warning" : "info" },
    ...(isErr
      ? {
          error: {
            type: "Unavailable",
            message: `BeyondCorp connector ${appConnector} health check failed`,
          },
        }
      : {}),
  };
}

export function generateBinaryAuthorizationLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const cluster = randGkeCluster();
  const namespace = randGkeNamespace();
  const pod = `checkout-${randId(5).toLowerCase()}-${randId(5).toLowerCase()}`;
  const image = rand([
    `us-docker.pkg.dev/${project.id}/apps/checkout:v${randInt(1, 9)}.${randInt(0, 20)}`,
    `gcr.io/${project.id}/payments-api@sha256:${randId(64).toLowerCase()}`,
  ]);
  const attestor = rand(["build-attestor", "prod-security", "cosign-prod"]);
  const verdict = isErr ? "DENIED" : rand(["ALLOWED", "DENIED", "BREAK_GLASS"]);
  const policyName = rand(["globex-prod-policy", "pci-images-only", "dev-permissive"]);
  const durationNs = randLatencyMs(15, isErr) * 1e6;
  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "binary-authorization"),
    gcp: {
      binary_authorization: {
        cluster,
        namespace,
        pod,
        image,
        attestor,
        verdict,
        policy_name: policyName,
      },
    },
    event: {
      outcome: verdict === "ALLOWED" || verdict === "BREAK_GLASS" ? "success" : "failure",
      duration: durationNs,
    },
    message: isErr
      ? `Binary Authorization admission review failed for ${namespace}/${pod}: policy backend error`
      : `Binary Authorization ${verdict} for ${image} on ${cluster}/${namespace}/${pod}`,
    log: { level: verdict === "DENIED" || isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            type: "Internal",
            message: "Binary Authorization policy server returned 503 during admission",
          },
        }
      : {}),
  };
}

export function generateVpcServiceControlsLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const perimeterName = rand(["prod_default", "pci_services", "data_analytics"]);
  const accessLevel = rand(["corp_devices", "vpn_only", "partner_restricted"]);
  const resource = rand([
    `projects/${project.id}`,
    `//storage.googleapis.com/projects/_/buckets/${randBucket()}`,
    `//bigquery.googleapis.com/projects/${project.id}/datasets/${rand(["analytics", "exports"])}`,
  ]);
  const apiMethod = rand(["storage.objects.get", "bigquery.jobs.create", "compute.instances.list"]);
  const violationType = rand(["RESOURCES_NOT_IN_SAME_PERIMETER", "ACCESS_NOT_ALLOWED"]);
  const dryRunMode = !isErr && Math.random() > 0.7;
  const durationNs = randLatencyMs(12, isErr) * 1e6;
  const blocked = !dryRunMode && (isErr || violationType === "ACCESS_NOT_ALLOWED");
  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "vpc-service-controls"),
    gcp: {
      vpc_service_controls: {
        perimeter_name: perimeterName,
        access_level: accessLevel,
        resource,
        api_method: apiMethod,
        violation_type: violationType,
        dry_run_mode: dryRunMode,
      },
    },
    event: {
      outcome: blocked ? "failure" : "success",
      duration: durationNs,
    },
    message: dryRunMode
      ? `[dry-run] VPC SC would block ${apiMethod} on ${resource} (${violationType})`
      : isErr
        ? `VPC Service Controls policy lookup failed for ${perimeterName}: IAM error`
        : blocked
          ? `VPC Service Controls blocked ${apiMethod} for ${resource}: ${violationType} (perimeter ${perimeterName})`
          : `VPC SC audit: allowed ${apiMethod} within perimeter ${perimeterName}`,
    log: { level: blocked || isErr ? "warning" : "info" },
    ...(isErr
      ? {
          error: {
            type: "PermissionDenied",
            message: "Caller cannot read VPC Service Controls perimeter metadata",
          },
        }
      : {}),
  };
}

export function generateAccessContextManagerLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const accessLevelName = rand(["corp_trusted", "geo_us_only", "mdm_enrolled"]);
  const conditionType = rand(["ip_subnetwork", "device_policy", "regions"]);
  const satisfied = !isErr && Math.random() > 0.25;
  const requestIp = randIp();
  const deviceState = rand(["COMPLIANT", "NON_COMPLIANT", "UNKNOWN"]);
  const durationNs = randLatencyMs(20, isErr) * 1e6;
  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "access-context-manager"),
    gcp: {
      access_context_manager: {
        access_level_name: accessLevelName,
        condition_type: conditionType,
        satisfied,
        request_ip: requestIp,
        device_state: deviceState,
      },
    },
    event: {
      outcome: satisfied ? "success" : "failure",
      duration: durationNs,
    },
    message: isErr
      ? `Access Context Manager evaluation error for level ${accessLevelName}: backend unavailable`
      : satisfied
        ? `Access level ${accessLevelName} satisfied (${conditionType}) for ${requestIp}`
        : `Access level ${accessLevelName} not satisfied: ${conditionType}, device ${deviceState}`,
    log: { level: isErr || !satisfied ? "warning" : "info" },
    ...(isErr
      ? {
          error: {
            type: "Unavailable",
            message: "Access Context Manager API timeout during condition evaluation",
          },
        }
      : {}),
  };
}

export function generateAssuredWorkloadsLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const workloadName = rand(["fedramp-moderate-workload", "il4-data-plane", "cjis-criminal-justice"]);
  const complianceRegime = rand(["FEDRAMP_MODERATE", "IL4", "CJIS", "HIPAA"]);
  const resourceType = rand(["FOLDER", "PROJECT", "KEYRING"]);
  const violationType = rand(["RESOURCE_OUTSIDE_COMPLIANCE_BOUNDS", "FORBIDDEN_SERVICE", "INVALID_ENCRYPTION"]);
  const remediationStatus = isErr ? "OPEN" : rand(["OPEN", "IN_PROGRESS", "RESOLVED"]);
  const durationNs = randLatencyMs(500, isErr) * 1e6;
  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "assured-workloads"),
    gcp: {
      assured_workloads: {
        workload_name: workloadName,
        compliance_regime: complianceRegime,
        resource_type: resourceType,
        violation_type: violationType,
        remediation_status: remediationStatus,
        resource_name: `projects/${project.id}`,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: durationNs,
    },
    message: isErr
      ? `Assured Workloads compliance check failed for ${workloadName}: could not validate ${resourceType}`
      : `Assured Workloads: ${violationType} under ${complianceRegime} — remediation ${remediationStatus}`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            type: "Internal",
            message: "Failed to fetch organization policy for compliance evaluation",
          },
        }
      : {}),
  };
}

export function generateChronicleLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const ruleName = rand(["suspicious_login_geo", "lateral_movement_rdp", "gcp_iam_priv_esc", "dns_tunneling"]);
  const detectionType = rand(["RULE_DETECTION", "CURATED_DETECTION", "ALERT"]);
  const severity = randSeverity(isErr);
  const alertState = isErr ? "NEW" : rand(["NEW", "ACKNOWLEDGED", "DISMISSED"]);
  const iocType = rand(["IP", "DOMAIN", "HASH"]);
  const matchedEventsCount = isErr ? 0 : randInt(3, 50000);
  const durationNs = randLatencyMs(80, isErr) * 1e6;
  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "chronicle"),
    gcp: {
      chronicle: {
        rule_name: ruleName,
        detection_type: detectionType,
        severity,
        alert_state: alertState,
        ioc_type: iocType,
        matched_events_count: matchedEventsCount,
        case_name: `CASE-${randId(6)}`,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: durationNs,
    },
    message: isErr
      ? `Chronicle rule ${ruleName} execution failed: invalid reference list`
      : `Chronicle ${detectionType}: ${ruleName} matched ${matchedEventsCount} events (${iocType}, ${severity})`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            type: "InvalidArgument",
            message: "Rule references missing YARA-L function",
          },
        }
      : {}),
  };
}

export function generateRecaptchaEnterpriseLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const siteKey = `6L${randId(20)}`;
  const action = rand(["login", "signup", "checkout", "password_reset", "contact_form"]);
  const score = isErr ? randFloat(0, 0.29) : randFloat(0.3, 1.0);
  const tokenValid = !isErr && score > 0.4;
  const riskAnalysisReasons = rand([
    "AUTOMATION",
    "TOO_MUCH_TRAFFIC",
    "UNEXPECTED_ENVIRONMENT",
  ]);
  const durationNs = randLatencyMs(18, isErr) * 1e6;
  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "recaptcha-enterprise"),
    gcp: {
      recaptcha_enterprise: {
        site_key: siteKey,
        action,
        score: Math.round(score * 1000) / 1000,
        token_valid: tokenValid,
        risk_analysis_reasons: riskAnalysisReasons,
        expected_action: action,
      },
    },
    event: {
      outcome: tokenValid ? "success" : "failure",
      duration: durationNs,
    },
    message: isErr
      ? `reCAPTCHA Enterprise assessment failed for action ${action}: invalid or expired token`
      : `reCAPTCHA score ${score.toFixed(2)} for ${action} (${riskAnalysisReasons})`,
    log: { level: isErr || !tokenValid ? "warning" : "info" },
    ...(isErr
      ? {
          error: {
            type: "InvalidToken",
            message: "The response token is invalid or malformed",
          },
        }
      : {}),
  };
}

export function generateWebSecurityScannerLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const scanConfig = `projects/${project.id}/scanConfigs/${randId(8)}`;
  const findingType = rand(["XSS", "SQL_INJECTION", "MIXED_CONTENT", "CLEAR_TEXT_PASSWORD", "OUTDATED_LIBRARY"]);
  const severity = rand(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);
  const url = rand([
    `https://app.${project.id.split("-")[0]}.example.com/search?q=test`,
    `https://api.${project.id.split("-")[0]}.example.com/v1/users`,
  ]);
  const httpMethod = rand(["GET", "POST", "PUT"]);
  const responseCode = isErr ? rand([0, 502, 503]) : rand([200, 301, 403, 404]);
  const durationNs = randLatencyMs(400, isErr) * 1e6;
  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "web-security-scanner"),
    gcp: {
      web_security_scanner: {
        scan_config: scanConfig,
        finding_type: findingType,
        severity,
        url,
        http_method: httpMethod,
        response_code: responseCode,
        finding_id: `finding-${randId(10)}`,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: durationNs,
    },
    message: isErr
      ? `Security scan failed for ${url}: crawler error (HTTP ${responseCode})`
      : `Security Scanner: ${severity} ${findingType} candidate at ${url} (${httpMethod})`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            type: "ScanFailed",
            message: "Unable to complete request to target URL",
          },
        }
      : {}),
  };
}

export function generateIdentityAwareProxyLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const resource = `//compute.googleapis.com/projects/${project.id}/zones/${region}-a/instances/iap-${randId(4)}`;
  const userEmail = rand([`user@${project.id.split("-")[0]}.example.com`, `contractor@partner.example.com`]);
  const deviceState = rand(["COMPLIANT", "NON_COMPLIANT", "UNKNOWN"] as const);
  const accessDecision = isErr ? "DENY" : rand(["ALLOW", "DENY"] as const);
  const policyName = rand(["iap-baseline", "vendor-restricted", "admin-breakglass"]);
  const contextLevel = rand(["LEVEL_1", "LEVEL_2", "LEVEL_3"] as const);
  const clientIp = randIp();
  const durationNs = randLatencyMs(25, isErr) * 1e6;
  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "identity-aware-proxy"),
    gcp: {
      identity_aware_proxy: {
        resource,
        user_email: userEmail,
        device_state: deviceState,
        access_decision: accessDecision,
        policy_name: policyName,
        context_level: contextLevel,
        client_ip: clientIp,
      },
    },
    event: {
      outcome: accessDecision === "ALLOW" && !isErr ? "success" : "failure",
      duration: durationNs,
    },
    message: isErr
      ? `IAP ${accessDecision} for ${userEmail} -> ${resource}: policy evaluation error`
      : `IAP ${accessDecision}: ${userEmail} from ${clientIp} (${deviceState}, ${contextLevel})`,
    log: { level: isErr || accessDecision === "DENY" ? "warning" : "info" },
  };
}

export function generateDlpLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const jobName = `dlp-job-${randId(8).toLowerCase()}`;
  const inspectTemplate = `projects/${project.id}/inspectTemplates/${rand(["pii", "pci", "phi"])}-${randId(4)}`;
  const infoType = rand([
    "EMAIL_ADDRESS",
    "CREDIT_CARD",
    "PHONE_NUMBER",
    "SSN",
    "PASSPORT",
    "IBAN",
  ] as const);
  const findingsCount = isErr ? randInt(0, 2) : randInt(0, 500);
  const bytesScanned = isErr ? randInt(100, 5000) : randInt(50_000, 500_000_000);
  const action = rand(["INSPECT", "DEIDENTIFY", "REDACT"] as const);
  const durationNs = randLatencyMs(200, isErr) * 1e6;
  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "dlp"),
    gcp: {
      dlp: {
        job_name: jobName,
        inspect_template: inspectTemplate,
        info_type: infoType,
        findings_count: findingsCount,
        bytes_scanned: bytesScanned,
        action,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: durationNs,
    },
    message: isErr
      ? `DLP ${action} job ${jobName} failed on template ${inspectTemplate}`
      : `DLP ${action}: ${findingsCount} findings for ${infoType} (${bytesScanned} bytes scanned)`,
    log: { level: isErr ? "error" : "info" },
  };
}

export function generateWebRiskLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const uri = rand([
    `https://evil-${randId(6)}.example/download`,
    `http://phish-${randId(4)}.net/login`,
    `https://cdn.${project.id}.example/asset`,
  ]);
  const threatType = rand([
    "MALWARE",
    "SOCIAL_ENGINEERING",
    "UNWANTED_SOFTWARE",
    "THREAT_TYPE_UNSPECIFIED",
  ] as const);
  const confidence = isErr ? randFloat(0.2, 0.55) : randFloat(0.6, 0.99);
  const platformType = rand(["ANY", "ALL_PLATFORMS", "WINDOWS", "LINUX"] as const);
  const durationNs = randLatencyMs(15, isErr) * 1e6;
  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "web-risk"),
    gcp: {
      web_risk: {
        uri,
        threat_type: threatType,
        confidence: Math.round(confidence * 1000) / 1000,
        platform_type: platformType,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: durationNs,
    },
    message: isErr
      ? `Web Risk lookup failed for ${uri}: upstream error`
      : `Web Risk: ${threatType} confidence=${confidence.toFixed(2)} for ${uri} (${platformType})`,
    log: { level: isErr ? "error" : "warning" },
  };
}

export function generateCloudIdentityLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const eventType = rand([
    "USER_CREATED",
    "GROUP_MODIFIED",
    "DEVICE_ENROLLED",
    "2SV_ENABLED",
    "SSO_LOGIN",
  ] as const);
  const userEmail = rand([`user@${project.id.split("-")[0]}.example.com`, `admin@${project.id.split("-")[0]}.example.com`]);
  const groupName = rand(["engineering", "security", "contractors", "all-staff"]);
  const deviceType = rand(["CHROME_OS", "ANDROID", "IOS", "WINDOWS"] as const);
  const adminActor = rand([`admin@${project.id.split("-")[0]}.example.com`, "system@google.com"]);
  const durationNs = randLatencyMs(40, isErr) * 1e6;
  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "cloud-identity"),
    gcp: {
      cloud_identity: {
        event_type: eventType,
        user_email: userEmail,
        group_name: groupName,
        device_type: deviceType,
        admin_actor: adminActor,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: durationNs,
    },
    message: isErr
      ? `Cloud Identity ${eventType} failed for ${userEmail}: directory sync error`
      : `Cloud Identity ${eventType}: ${userEmail} group=${groupName} device=${deviceType} by ${adminActor}`,
    log: { level: isErr ? "error" : "info" },
  };
}

export function generateManagedAdLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const domainName = `${rand(["corp", "globex", "prod"])}.internal`;
  const forestTrust = rand(["INBOUND", "OUTBOUND", "BIDIRECTIONAL", "NONE"] as const);
  const operation = rand(["CREATE_DOMAIN", "EXTEND_SCHEMA", "RESET_PASSWORD", "CREATE_BACKUP"] as const);
  const domainControllerIp = `10.${randInt(1, 200)}.${randInt(1, 250)}.${randInt(2, 250)}`;
  const replicationStatus = isErr ? rand(["FAILED", "LAGGING"] as const) : rand(["HEALTHY", "SYNCED", "IN_PROGRESS"] as const);
  const durationNs = randLatencyMs(500, isErr) * 1e6;
  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "managed-ad"),
    gcp: {
      managed_ad: {
        domain_name: domainName,
        forest_trust: forestTrust,
        operation,
        domain_controller_ip: domainControllerIp,
        replication_status: replicationStatus,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: durationNs,
    },
    message: isErr
      ? `Managed Microsoft AD ${operation} on ${domainName} failed: replication ${replicationStatus}`
      : `Managed AD ${operation} ${domainName} DC ${domainControllerIp} (${replicationStatus})`,
    log: { level: isErr ? "error" : "info" },
  };
}

export function generateOsLoginLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const user = rand([`dev@${project.id.split("-")[0]}.example.com`, `sre@${project.id}.example.com`]);
  const action = rand(["LOGIN", "LOGOUT", "SSH_KEY_ADD", "SSH_KEY_REMOVE", "POSIX_ACCOUNT_UPDATE"] as const);
  const instance = `vm-${rand(["bastion", "build"])}-${randId(4).toLowerCase()}`;
  const sshKeyFingerprint = `SHA256:${Array.from({ length: 44 }, () => randInt(0, 15).toString(16)).join("")}`;
  const loginMethod = rand(["SSH_KEY", "OS_LOGIN_2FA"] as const);
  const durationNs = randLatencyMs(30, isErr) * 1e6;
  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "os-login"),
    gcp: {
      os_login: {
        user,
        action,
        instance,
        ssh_key_fingerprint: sshKeyFingerprint,
        login_method: loginMethod,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: durationNs,
    },
    message: isErr
      ? `OS Login ${action} failed for ${user} on ${instance}: permission denied`
      : `OS Login ${action}: ${user} on ${instance} via ${loginMethod}`,
    log: { level: isErr ? "error" : "info" },
  };
}

export function generateSecurityOperationsLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const caseId = `case-${randId(10).toLowerCase()}`;
  const playbookName = rand(["phish_triage", "malware_contain", "iam_review", "data_exfil"]);
  const actionType = rand([
    "CASE_CREATED",
    "PLAYBOOK_TRIGGERED",
    "ALERT_GROUPED",
    "ENTITY_ENRICHED",
    "RESPONSE_ACTION",
  ] as const);
  const severity = rand(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const);
  const entitiesCount = isErr ? randInt(0, 3) : randInt(2, 200);
  const indicatorsCount = isErr ? randInt(0, 5) : randInt(1, 80);
  const durationNs = randLatencyMs(120, isErr) * 1e6;
  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "security-operations"),
    gcp: {
      security_operations: {
        case_id: caseId,
        playbook_name: playbookName,
        action_type: actionType,
        severity: isErr ? "HIGH" : severity,
        entities_count: entitiesCount,
        indicators_count: indicatorsCount,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: durationNs,
    },
    message: isErr
      ? `Security Operations ${actionType} on ${caseId} failed: playbook ${playbookName}`
      : `Security Operations ${actionType} case ${caseId} (${severity}): ${entitiesCount} entities, ${indicatorsCount} indicators`,
    log: { level: isErr ? "error" : "info" },
  };
}
