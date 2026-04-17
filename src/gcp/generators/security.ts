import {
  type EcsDocument,
  type GcpProject,
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
  randServiceAccount,
  randUUID,
  USER_AGENTS,
} from "./helpers.js";

const AUDIT_TYPE = "type.googleapis.com/google.cloud.audit.AuditLog";

function randUUIDLike(): string {
  return `${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`.toLowerCase();
}

function gcpLogName(projectId: string, logId: string) {
  return `projects/${projectId}/logs/${encodeURIComponent(logId)}`;
}

function principalToAuditEmail(principal: string, project: GcpProject): string {
  if (principal.startsWith("user:")) return principal.slice(5);
  if (principal.startsWith("serviceAccount:")) return principal.slice(17);
  if (principal.startsWith("group:")) return principal.slice(6);
  return randServiceAccount(project);
}

function auditProto(opts: {
  methodName: string;
  serviceName: string;
  resourceName: string;
  principalEmail: string;
  serviceAccountKeyName?: string;
  authorizationInfo: { resource: string; permission: string; granted: boolean }[];
  request?: Record<string, unknown>;
  response?: Record<string, unknown>;
}) {
  return {
    "@type": AUDIT_TYPE,
    authenticationInfo: {
      principalEmail: opts.principalEmail,
      ...(opts.serviceAccountKeyName ? { serviceAccountKeyName: opts.serviceAccountKeyName } : {}),
    },
    authorizationInfo: opts.authorizationInfo.map((a) => ({
      resource: a.resource,
      permission: a.permission,
      granted: a.granted,
    })),
    methodName: opts.methodName,
    serviceName: opts.serviceName,
    resourceName: opts.resourceName,
    requestMetadata: {
      callerIp: randIp(),
      callerSuppliedUserAgent: rand(USER_AGENTS),
      requestAttributes: {},
    },
    ...(opts.request ? { request: opts.request } : {}),
    ...(opts.response ? { response: opts.response } : {}),
  };
}

export function generateSecurityCommandCenterLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const orgId = randInt(100000, 999999);
  const findingId = `organizations/${orgId}/sources/${randId(8)}/findings/${randUUIDLike()}`;
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
  const severity = rand(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const);
  const resourceName = rand([
    `//compute.googleapis.com/projects/${project.id}/zones/${region}-a/instances/api-${randId(4)}`,
    `//storage.googleapis.com/projects/_/buckets/${randBucket()}`,
    `//cloudsql.googleapis.com/projects/${project.id}/instances/db-${randId(4)}`,
  ]);
  const resourceType = rand([
    "compute.googleapis.com/Instance",
    "storage.googleapis.com/Bucket",
    "sqladmin.googleapis.com/Instance",
  ]);
  const state = rand(["ACTIVE", "INACTIVE", "MUTED"] as const);
  const source = rand([
    "SECURITY_HEALTH_ANALYTICS",
    "EVENT_THREAT_DETECTION",
    "CONTAINER_THREAT_DETECTION",
    "WEB_SECURITY_SCANNER",
  ]);
  const durationNs = randLatencyMs(120, isErr) * 1e6;
  const parentDisplayName = `Globex Org ${orgId}`;
  const jsonPayload = {
    notificationConfigName: `organizations/${orgId}/notificationConfigs/${randId(8)}`,
    finding: {
      name: findingId,
      parent: `organizations/${orgId}/sources/${randId(8)}`,
      resourceName,
      resourceType,
      category,
      state,
      severity: isErr ? "HIGH" : severity,
      sourceProperties: {
        ScannerName: source,
        ComplianceFramework: rand(["CIS", "PCI_DSS", "ISO_27001", "SOC2"]),
        ReactivationCount: randInt(0, 5),
        ExceptionInstructions: "Review IAM and firewall rules",
      },
      externalUri: `https://console.cloud.google.com/security/command-center/findings?organizationId=${orgId}&findingId=${encodeURIComponent(findingId)}`,
      parentDisplayName,
      findingClass: "THREAT",
      muteInfo: state === "MUTED" ? { staticMute: { state: "MUTED", applyTime: ts } } : undefined,
    },
  };
  const sev = isErr ? "ERROR" : severity === "CRITICAL" || severity === "HIGH" ? "ALERT" : "NOTICE";

  return {
    "@timestamp": ts,
    severity: sev,
    logName: gcpLogName(project.id, "cloudaudit.googleapis.com/activity"),
    insertId: randId(16).toLowerCase(),
    resource: { type: "project", labels: { project_id: project.id } },
    jsonPayload,
    cloud: gcpCloud(region, project, "security-command-center"),
    gcp: {
      security_command_center: {
        json_payload: jsonPayload,
        finding_id: findingId,
        category,
        severity: isErr ? "HIGH" : severity,
        resource_name: resourceName,
        resource_type: resourceType,
        state,
        source,
        parent_display_name: parentDisplayName,
        organization_id: `organizations/${orgId}`,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: durationNs,
    },
    message: isErr
      ? `securitycenter.googleapis.com/Findings.Update finding=${findingId} status=PERMISSION_DENIED`
      : `securitycenter.googleapis.com/Findings.Notification ${category} ${severity} ${state} ${resourceType}`,
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

export function generateIamLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const principal = randPrincipal(project);
  const principalEmail = principalToAuditEmail(principal, project);
  const methodName = rand([
    "google.iam.admin.v1.SetIamPolicy",
    "google.iam.admin.v1.CreateServiceAccount",
    "google.iam.admin.v1.CreateServiceAccountKey",
    "google.iam.admin.v1.DeleteServiceAccount",
  ] as const);
  const resource = rand([
    `projects/${project.id}`,
    `projects/${project.id}/serviceAccounts/${randServiceAccount(project)}`,
    `projects/_/buckets/${randBucket()}`,
  ]);
  const permissionGranted = !isErr && Math.random() > 0.35;
  const policyDeltaAction = rand(["ADD", "REMOVE"] as const);
  const role = rand([
    "roles/owner",
    "roles/editor",
    "roles/storage.admin",
    "roles/iam.serviceAccountTokenCreator",
    "roles/bigquery.dataEditor",
  ]);
  const durationNs = randLatencyMs(45, isErr) * 1e6;
  const saKeyName =
    methodName === "google.iam.admin.v1.CreateServiceAccountKey"
      ? `//iam.googleapis.com/projects/${project.id}/serviceAccounts/${randServiceAccount(project)}/keys/${randId(8)}`
      : undefined;
  const request =
    methodName === "google.iam.admin.v1.SetIamPolicy"
      ? {
          policy: {
            bindings: [
              {
                role,
                members:
                  policyDeltaAction === "ADD"
                    ? [`serviceAccount:${randServiceAccount(project)}`]
                    : [],
              },
            ],
            etag: `Bw${randId(12)}=`,
          },
          updateMask: "bindings",
        }
      : methodName === "google.iam.admin.v1.CreateServiceAccount"
        ? { accountId: `sa-${randId(6)}`, serviceAccount: { displayName: "Workload SA" } }
        : undefined;
  const protoPayload = auditProto({
    methodName,
    serviceName: "iam.googleapis.com",
    resourceName: resource.startsWith("projects/_/buckets")
      ? `//storage.googleapis.com/${resource}`
      : resource,
    principalEmail,
    serviceAccountKeyName: saKeyName,
    authorizationInfo: [
      {
        resource: resource.startsWith("projects/_/buckets")
          ? `//storage.googleapis.com/${resource}`
          : resource.startsWith("projects/") && resource.includes("/serviceAccounts/")
            ? `//iam.googleapis.com/${resource}`
            : `//cloudresourcemanager.googleapis.com/${resource}`,
        permission:
          methodName === "google.iam.admin.v1.SetIamPolicy"
            ? "resourcemanager.projects.setIamPolicy"
            : methodName === "google.iam.admin.v1.CreateServiceAccountKey"
              ? "iam.serviceAccountKeys.create"
              : "iam.serviceAccounts.create",
        granted: permissionGranted,
      },
    ],
    request,
  });

  return {
    "@timestamp": ts,
    severity: isErr ? "ERROR" : "NOTICE",
    logName: gcpLogName(project.id, "cloudaudit.googleapis.com/activity"),
    insertId: randId(16).toLowerCase(),
    resource: { type: "project", labels: { project_id: project.id } },
    protoPayload,
    cloud: gcpCloud(region, project, "iam"),
    gcp: {
      iam: {
        proto_payload: protoPayload,
        principal,
        principal_email: principalEmail,
        service_account_key_name: saKeyName,
        action: methodName.split(".").pop(),
        resource,
        permission_granted: permissionGranted,
        policy_delta_action: policyDeltaAction,
        role,
        request_id: randId(16).toLowerCase(),
        authorization_info: protoPayload.authorizationInfo,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: durationNs,
    },
    message: isErr
      ? `cloudaudit.googleapis.com/activity ${methodName} PERMISSION_DENIED principal=${principalEmail}`
      : `cloudaudit.googleapis.com/activity ${methodName} resource=${resource} granted=${permissionGranted}`,
    ...(isErr
      ? {
          error: {
            type: "PermissionDenied",
            message: `Principal ${principalEmail} is not authorized`,
          },
        }
      : {}),
  };
}

export function generateSecretManagerLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const secretId = `${rand(["api-key", "db-creds", "jwt-signing", "webhook-hmac", "tls-bundle"])}-${randId(4)}`;
  const secretName = `projects/${project.id}/secrets/${secretId}`;
  const versionNum = randInt(1, 12);
  const version = `${secretName}/versions/${versionNum}`;
  const methodName = rand([
    "google.cloud.secretmanager.v1.SecretManagerService.AccessSecretVersion",
    "google.cloud.secretmanager.v1.SecretManagerService.AddSecretVersion",
    "google.cloud.secretmanager.v1.SecretManagerService.DestroySecretVersion",
    "google.cloud.secretmanager.v1.SecretManagerService.EnableSecretVersion",
  ] as const);
  const accessor = randPrincipal(project);
  const principalEmail = principalToAuditEmail(accessor, project);
  const durationNs = randLatencyMs(25, isErr) * 1e6;
  const protoPayload = auditProto({
    methodName,
    serviceName: "secretmanager.googleapis.com",
    resourceName: version,
    principalEmail,
    authorizationInfo: [
      {
        resource: `//secretmanager.googleapis.com/${secretName}`,
        permission: "secretmanager.versions.access",
        granted: !isErr,
      },
    ],
    request: { name: version },
  });

  return {
    "@timestamp": ts,
    severity: isErr ? "ERROR" : "INFO",
    logName: gcpLogName(project.id, "cloudaudit.googleapis.com/data_access"),
    insertId: randId(16).toLowerCase(),
    resource: {
      type: "secretmanager_secret",
      labels: { project_id: project.id, secret_id: secretId },
    },
    protoPayload,
    cloud: gcpCloud(region, project, "secret-manager"),
    gcp: {
      secret_manager: {
        proto_payload: protoPayload,
        secret_name: secretName,
        version,
        action: methodName.split(".").pop(),
        accessor,
        replication: rand(["automatic", "user_managed"]),
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: durationNs,
    },
    message: `secretmanager.googleapis.com ${methodName} ${secretName}`,
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
  const methodName = rand([
    "google.cloud.kms.v1.KeyManagementService.Encrypt",
    "google.cloud.kms.v1.KeyManagementService.Decrypt",
    "google.cloud.kms.v1.KeyManagementService.CreateCryptoKey",
    "google.cloud.kms.v1.KeyManagementService.CreateCryptoKeyVersion",
    "google.cloud.kms.v1.KeyManagementService.RotateCryptoKeyVersion",
    "google.cloud.kms.v1.KeyManagementService.SetIamPolicy",
  ] as const);
  const algorithm = rand([
    "GOOGLE_SYMMETRIC_ENCRYPTION",
    "RSA_SIGN_PSS_2048_SHA256",
    "RSA_SIGN_PKCS1_4096_SHA512",
    "EC_SIGN_P256_SHA256",
    "AES_256_GCM",
  ]);
  const durationNs = randLatencyMs(8, isErr) * 1e6;
  const keyPath = `projects/${project.id}/locations/${region}/keyRings/${keyRing}/cryptoKeys/${cryptoKey}`;
  const keyVersionName = `${keyPath}/cryptoKeyVersions/${version}`;
  const caller = randServiceAccount(project);
  const protoPayload = auditProto({
    methodName,
    serviceName: "cloudkms.googleapis.com",
    resourceName:
      methodName.includes("CryptoKeyVersion") ||
      methodName.endsWith("Encrypt") ||
      methodName.endsWith("Decrypt")
        ? keyVersionName
        : keyPath,
    principalEmail: caller,
    authorizationInfo: [
      {
        resource: `//cloudkms.googleapis.com/${keyPath}`,
        permission: methodName.endsWith("Encrypt")
          ? "cloudkms.cryptoKeyVersions.useToEncrypt"
          : methodName.endsWith("Decrypt")
            ? "cloudkms.cryptoKeyVersions.useToDecrypt"
            : methodName.includes("SetIamPolicy")
              ? "cloudkms.cryptoKeys.setIamPolicy"
              : "cloudkms.cryptoKeys.create",
        granted: !isErr,
      },
    ],
    request:
      methodName === "google.cloud.kms.v1.KeyManagementService.Encrypt"
        ? { name: keyVersionName, plaintext_crc32c: randInt(100000, 999999999) }
        : methodName === "google.cloud.kms.v1.KeyManagementService.Decrypt"
          ? { name: keyVersionName }
          : methodName === "google.cloud.kms.v1.KeyManagementService.SetIamPolicy"
            ? {
                resource: keyPath,
                policy: {
                  bindings: [
                    {
                      role: "roles/cloudkms.cryptoKeyEncrypterDecrypter",
                      members: [`serviceAccount:${caller}`],
                    },
                  ],
                },
              }
            : { parent: `${keyPath.split("/cryptoKeys/")[0]}`, crypto_key_id: cryptoKey },
    response: methodName.includes("CreateCryptoKey")
      ? { name: keyPath, primary: { algorithm, name: keyVersionName, state: "ENABLED" } }
      : undefined,
  });

  return {
    "@timestamp": ts,
    severity: isErr ? "ERROR" : "INFO",
    logName: gcpLogName(project.id, "cloudaudit.googleapis.com/data_access"),
    insertId: randId(16).toLowerCase(),
    resource: {
      type: "cloudkms_cryptokeyversion",
      labels: {
        project_id: project.id,
        key_ring: keyRing,
        crypto_key: cryptoKey,
        location: region,
      },
    },
    protoPayload,
    cloud: gcpCloud(region, project, "cloud-kms"),
    gcp: {
      cloud_kms: {
        proto_payload: protoPayload,
        key_ring: keyRing,
        crypto_key: cryptoKey,
        version,
        operation: methodName.split(".").pop(),
        algorithm,
        key_name: keyVersionName,
        caller,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: durationNs,
    },
    message: `cloudkms.googleapis.com ${methodName} ${keyPath}`,
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
  const methodName = rand([
    "google.cloud.security.privateca.v1.CertificateAuthorityService.IssueCertificate",
    "google.cloud.security.privateca.v1.CertificateAuthorityService.RevokeCertificate",
    "google.cloud.security.privateca.v1.CertificateAuthorityService.EnableCertificateAuthority",
    "google.cloud.security.privateca.v1.CertificateAuthorityService.DisableCertificateAuthority",
  ] as const);
  const validityDays = randInt(30, 397);
  const keyAlgorithm = rand(["RSA_PKCS1_2048_SHA256", "EC_P256_SHA256", "RSA_PKCS1_4096_SHA256"]);
  const durationNs = randLatencyMs(200, isErr) * 1e6;
  const caPath = `projects/${project.id}/locations/${region}/caPools/${caPool}/certificateAuthorities/${caName}`;
  const principalEmail = randServiceAccount(project);
  const protoPayload = auditProto({
    methodName,
    serviceName: "privateca.googleapis.com",
    resourceName: `${caPath}/certificates/${certificateId}`,
    principalEmail,
    authorizationInfo: [
      {
        resource: `//privateca.googleapis.com/${caPath}`,
        permission: "privateca.certificates.create",
        granted: !isErr,
      },
    ],
    request: {
      parent: caPath,
      certificateId,
      request: {
        pemCsr: "-----BEGIN CERTIFICATE REQUEST-----\nMIIB...\n-----END CERTIFICATE REQUEST-----",
        validity: { lifetime: `${validityDays * 86400}s` },
        publicKeyAlgorithm: keyAlgorithm,
      },
    },
  });

  return {
    "@timestamp": ts,
    severity: isErr ? "ERROR" : "NOTICE",
    logName: gcpLogName(project.id, "cloudaudit.googleapis.com/activity"),
    insertId: randId(16).toLowerCase(),
    resource: {
      type: "privateca_certificate_authority",
      labels: { project_id: project.id, location: region, ca_pool: caPool },
    },
    protoPayload,
    cloud: gcpCloud(region, project, "certificate-authority-service"),
    gcp: {
      certificate_authority: {
        proto_payload: protoPayload,
        ca_pool: caPool,
        ca_name: caName,
        certificate_id: certificateId,
        operation: methodName.split(".").pop(),
        validity_days: validityDays,
        key_algorithm: keyAlgorithm,
        location: region,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: durationNs,
    },
    message: `privateca.googleapis.com ${methodName} ${caPath}`,
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
  const application = rand([
    "erp.globex.internal",
    "gitlab.globex.io",
    "jira.globex.io",
    "wiki.globex.io",
  ]);
  const userEmail = rand([
    "alice@globex.example.com",
    "bob@globex.example.com",
    "contractor@partner.example.com",
  ]);
  const deviceTrustLevel = rand(["TRUST", "UNTRUST"] as const);
  const accessDecision = isErr ? "DENY" : rand(["ALLOW", "DENY"] as const);
  const policyName = rand(["corp-baseline", "vendor-restricted", "break-glass-admin"]);
  const durationNs = randLatencyMs(35, isErr) * 1e6;
  const jsonPayload = {
    application_name: application,
    connector_id: `projects/${project.id}/locations/${region}/connectors/${appConnector}`,
    user_id: userEmail,
    device_trust_level: deviceTrustLevel,
    access_decision: accessDecision,
    access_policy: policyName,
    session_id: randUUID(),
    client_ip: randIp(),
    user_agent: rand(USER_AGENTS),
  };

  return {
    "@timestamp": ts,
    severity: isErr || accessDecision === "DENY" ? "WARNING" : "INFO",
    logName: gcpLogName(project.id, "beyondcorp.googleapis.com/connector_access"),
    insertId: randId(16).toLowerCase(),
    resource: {
      type: "beyondcorp_app_connector",
      labels: { project_id: project.id, connector: appConnector },
    },
    jsonPayload,
    cloud: gcpCloud(region, project, "beyondcorp"),
    gcp: {
      beyondcorp: {
        json_payload: jsonPayload,
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
    message: `beyondcorp.googleapis.com/EvaluateAccess user=${userEmail} app=${application} decision=${accessDecision}`,
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
  const verdict = isErr ? "DENIED" : rand(["ALLOWED", "DENIED", "BREAK_GLASS"] as const);
  const policyName = rand(["globex-prod-policy", "pci-images-only", "dev-permissive"]);
  const durationNs = randLatencyMs(15, isErr) * 1e6;
  const jsonPayload = {
    typeUrl:
      "type.googleapis.com/google.cloud.binaryauthorization.v1beta1.ContinuousValidationEvent",
    policy: `projects/${project.id}/platforms/gke/policies/${policyName}`,
    cluster: `projects/${project.id}/locations/${region}/clusters/${cluster}`,
    deployable: { pod_name: `${namespace}/${pod}`, container_image: image },
    verdict,
    attestations: [
      { attestor: `projects/${project.id}/attestors/${attestor}`, pgp_key_id: `0x${randId(16)}` },
    ],
    reason: verdict === "DENIED" ? "No valid attestor for image" : undefined,
  };

  return {
    "@timestamp": ts,
    severity: verdict === "DENIED" || isErr ? "ERROR" : "INFO",
    logName: gcpLogName(project.id, "binaryauthorization.googleapis.com/policy_events"),
    insertId: randId(16).toLowerCase(),
    resource: {
      type: "gke_cluster",
      labels: { project_id: project.id, cluster_name: cluster, location: region },
    },
    jsonPayload,
    cloud: gcpCloud(region, project, "binary-authorization"),
    gcp: {
      binary_authorization: {
        json_payload: jsonPayload,
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
    message: `binaryauthorization.googleapis.com/Admission ${verdict} cluster=${cluster} image=${image}`,
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
  const violationType = rand(["RESOURCES_NOT_IN_SAME_PERIMETER", "ACCESS_NOT_ALLOWED"] as const);
  const dryRunMode = !isErr && Math.random() > 0.7;
  const blocked = !dryRunMode && (isErr || violationType === "ACCESS_NOT_ALLOWED");
  const jsonPayload = {
    servicePerimeter: `accessPolicies/${randInt(100000, 999999)}/servicePerimeters/${perimeterName}`,
    violation: {
      type: violationType,
      resource,
      apiMethod,
      accessLevel,
      dryRun: dryRunMode,
    },
    ingressPolicy: "INGRESS_FROM_ORGANIZATION",
    vpc_network: `projects/${project.id}/global/networks/${rand(["default", "prod-vpc"])}`,
  };

  return {
    "@timestamp": ts,
    severity: blocked || isErr ? "WARNING" : "INFO",
    logName: gcpLogName(project.id, "cloudaudit.googleapis.com/policy"),
    insertId: randId(16).toLowerCase(),
    resource: { type: "project", labels: { project_id: project.id } },
    jsonPayload,
    cloud: gcpCloud(region, project, "vpc-service-controls"),
    gcp: {
      vpc_service_controls: {
        json_payload: jsonPayload,
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
      duration: randLatencyMs(12, isErr) * 1e6,
    },
    message: dryRunMode
      ? `accesscontextmanager.googleapis.com/VpcServiceControls [dry-run] would block ${apiMethod}`
      : `accesscontextmanager.googleapis.com/VpcServiceControls ${blocked ? "BLOCK" : "ALLOW"} ${apiMethod}`,
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
  const conditionType = rand(["ip_subnetwork", "device_policy", "regions"] as const);
  const satisfied = !isErr && Math.random() > 0.25;
  const requestIp = randIp();
  const deviceState = rand(["COMPLIANT", "NON_COMPLIANT", "UNKNOWN"] as const);
  const durationNs = randLatencyMs(20, isErr) * 1e6;
  const jsonPayload = {
    access_policy: `accessPolicies/${randInt(100000, 999999)}`,
    access_level: `accessPolicies/${randInt(100000, 999999)}/accessLevels/${accessLevelName}`,
    evaluation: {
      condition_type: conditionType,
      satisfied,
      request_ip: requestIp,
      device_state: deviceState,
      region: region.split("-")[0],
    },
  };

  return {
    "@timestamp": ts,
    severity: isErr || !satisfied ? "WARNING" : "INFO",
    logName: gcpLogName(project.id, "accesscontextmanager.googleapis.com/evaluations"),
    insertId: randId(16).toLowerCase(),
    resource: {
      type: "access_level",
      labels: { project_id: project.id, access_level: accessLevelName },
    },
    jsonPayload,
    cloud: gcpCloud(region, project, "access-context-manager"),
    gcp: {
      access_context_manager: {
        json_payload: jsonPayload,
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
    message: `accesscontextmanager.googleapis.com/EvaluateAccessLevel level=${accessLevelName} satisfied=${satisfied}`,
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
  const workloadName = rand([
    "fedramp-moderate-workload",
    "il4-data-plane",
    "cjis-criminal-justice",
  ]);
  const complianceRegime = rand(["FEDRAMP_MODERATE", "IL4", "CJIS", "HIPAA"]);
  const resourceType = rand(["FOLDER", "PROJECT", "KEYRING"] as const);
  const violationType = rand([
    "RESOURCE_OUTSIDE_COMPLIANCE_BOUNDS",
    "FORBIDDEN_SERVICE",
    "INVALID_ENCRYPTION",
  ] as const);
  const remediationStatus = isErr ? "OPEN" : rand(["OPEN", "IN_PROGRESS", "RESOLVED"] as const);
  const durationNs = randLatencyMs(500, isErr) * 1e6;
  const jsonPayload = {
    workload: `organizations/${randInt(100000, 999999)}/locations/us/assuredWorkloads/${workloadName}`,
    complianceRegime,
    violation: { type: violationType, resourceType, resource: `projects/${project.id}` },
    remediation: { status: remediationStatus, assignedTo: "security@globex.example.com" },
  };

  return {
    "@timestamp": ts,
    severity: isErr ? "ERROR" : "NOTICE",
    logName: gcpLogName(project.id, "assuredworkloads.googleapis.com/violations"),
    insertId: randId(16).toLowerCase(),
    resource: {
      type: "assured_workload",
      labels: { project_id: project.id, workload: workloadName },
    },
    jsonPayload,
    cloud: gcpCloud(region, project, "assured-workloads"),
    gcp: {
      assured_workloads: {
        json_payload: jsonPayload,
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
    message: `assuredworkloads.googleapis.com/Violation ${violationType} regime=${complianceRegime}`,
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
  const ruleName = rand([
    "suspicious_login_geo",
    "lateral_movement_rdp",
    "gcp_iam_priv_esc",
    "dns_tunneling",
  ]);
  const detectionType = rand(["RULE_DETECTION", "CURATED_DETECTION", "ALERT"] as const);
  const severity = randSeverity(isErr);
  const alertState = isErr ? "NEW" : rand(["NEW", "ACKNOWLEDGED", "DISMISSED"] as const);
  const iocType = rand(["IP", "DOMAIN", "HASH"] as const);
  const matchedEventsCount = isErr ? 0 : randInt(3, 50000);
  const durationNs = randLatencyMs(80, isErr) * 1e6;
  const jsonPayload = {
    result: {
      ruleName,
      versionId: `ru_${randId(8)}`,
      detections: [{ type: detectionType, severity, eventsMatched: matchedEventsCount }],
      ioc: {
        type: iocType,
        value:
          iocType === "IP"
            ? randIp()
            : iocType === "DOMAIN"
              ? `evil-${randId(6)}.net`
              : `sha256:${randId(64).toLowerCase()}`,
      },
    },
    case: { name: `CASE-${randId(6)}`, stage: alertState },
  };

  return {
    "@timestamp": ts,
    severity: isErr
      ? "ERROR"
      : severity === "ERROR" || severity === "CRITICAL"
        ? "ALERT"
        : "NOTICE",
    logName: gcpLogName(project.id, "chronicle.googleapis.com/alert"),
    insertId: randId(16).toLowerCase(),
    resource: { type: "chronicle_instance", labels: { project_id: project.id, region } },
    jsonPayload,
    cloud: gcpCloud(region, project, "chronicle"),
    gcp: {
      chronicle: {
        json_payload: jsonPayload,
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
    message: `chronicle.googleapis.com/Detections ${ruleName} ${detectionType} events=${matchedEventsCount}`,
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
  ] as const);
  const durationNs = randLatencyMs(18, isErr) * 1e6;
  const jsonPayload = {
    event: {
      token: `${randId(20)}.${randId(40)}.${randId(20)}`,
      siteKey,
      userAction: action,
      expectedAction: action,
      score: Math.round(score * 1000) / 1000,
      tokenProperties: {
        valid: tokenValid,
        ...(tokenValid ? {} : { invalidReason: "MALFORMED" }),
      },
      riskAnalysis: { reasons: [riskAnalysisReasons], extendedVerdictReasons: [] },
    },
    assessmentName: `projects/${project.id}/assessments/${randUUID()}`,
  };

  return {
    "@timestamp": ts,
    severity: isErr || !tokenValid ? "WARNING" : "INFO",
    logName: gcpLogName(project.id, "recaptchaenterprise.googleapis.com/assessments"),
    insertId: randId(16).toLowerCase(),
    resource: {
      type: "api",
      labels: { project_id: project.id, service: "recaptchaenterprise.googleapis.com" },
    },
    jsonPayload,
    cloud: gcpCloud(region, project, "recaptcha-enterprise"),
    gcp: {
      recaptcha_enterprise: {
        json_payload: jsonPayload,
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
    message: `recaptchaenterprise.googleapis.com/CreateAssessment action=${action} score=${score.toFixed(2)}`,
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
  const findingType = rand([
    "XSS",
    "SQL_INJECTION",
    "MIXED_CONTENT",
    "CLEAR_TEXT_PASSWORD",
    "OUTDATED_LIBRARY",
  ] as const);
  const severity = rand(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const);
  const url = rand([
    `https://app.${project.id.split("-")[0]}.example.com/search?q=test`,
    `https://api.${project.id.split("-")[0]}.example.com/v1/users`,
  ]);
  const httpMethod = rand(["GET", "POST", "PUT"] as const);
  const responseCode = isErr ? rand([0, 502, 503] as const) : rand([200, 301, 403, 404] as const);
  const durationNs = randLatencyMs(400, isErr) * 1e6;
  const findingId = `finding-${randId(10)}`;
  const jsonPayload = {
    scanRun: `${scanConfig}/scanRuns/${randId(12)}`,
    finding: {
      name: `${scanConfig}/findings/${findingId}`,
      findingType: `WEB_SECURITY_SCANNER_${findingType}`,
      severity,
      vulnerableUrl: url,
      httpMethod,
      responseCode,
      description: `${findingType} pattern detected in response body`,
      trackingId: randUUID(),
    },
  };

  return {
    "@timestamp": ts,
    severity: isErr ? "ERROR" : severity === "CRITICAL" || severity === "HIGH" ? "WARNING" : "INFO",
    logName: gcpLogName(project.id, "websecurityscanner.googleapis.com/findings"),
    insertId: randId(16).toLowerCase(),
    resource: {
      type: "web_security_scanner_scan_config",
      labels: { project_id: project.id, scan_config: scanConfig.split("/").pop() ?? "default" },
    },
    jsonPayload,
    cloud: gcpCloud(region, project, "web-security-scanner"),
    gcp: {
      web_security_scanner: {
        json_payload: jsonPayload,
        scan_config: scanConfig,
        finding_type: findingType,
        severity,
        url,
        http_method: httpMethod,
        response_code: responseCode,
        finding_id: findingId,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: durationNs,
    },
    message: `websecurityscanner.googleapis.com/Finding ${findingType} ${severity} ${url}`,
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
  const userEmail = rand([
    `user@${project.id.split("-")[0]}.example.com`,
    `contractor@partner.example.com`,
  ]);
  const deviceState = rand(["COMPLIANT", "NON_COMPLIANT", "UNKNOWN"] as const);
  const accessDecision = isErr ? "DENY" : rand(["ALLOW", "DENY"] as const);
  const policyName = rand(["iap-baseline", "vendor-restricted", "admin-breakglass"]);
  const contextLevel = rand(["LEVEL_1", "LEVEL_2", "LEVEL_3"] as const);
  const clientIp = randIp();
  const durationNs = randLatencyMs(25, isErr) * 1e6;
  const protoPayload = auditProto({
    methodName: "AuthorizeUser",
    serviceName: "iap.googleapis.com",
    resourceName: resource,
    principalEmail: userEmail,
    authorizationInfo: [
      {
        resource,
        permission: "iap.tunnelInstances.accessViaIAP",
        granted: accessDecision === "ALLOW" && !isErr,
      },
    ],
    request: {
      resource,
      userIdentity: userEmail,
      deviceState,
      accessPolicy: policyName,
      contextLevel,
      clientIp,
    },
  });

  return {
    "@timestamp": ts,
    severity: isErr || accessDecision === "DENY" ? "WARNING" : "INFO",
    logName: gcpLogName(project.id, "cloudaudit.googleapis.com/data_access"),
    insertId: randId(16).toLowerCase(),
    resource: {
      type: "gce_instance",
      labels: { project_id: project.id, instance_id: `iap-${randId(4)}`, zone: `${region}-a` },
    },
    protoPayload,
    cloud: gcpCloud(region, project, "identity-aware-proxy"),
    gcp: {
      identity_aware_proxy: {
        proto_payload: protoPayload,
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
    message: `iap.googleapis.com/AuthorizeUser ${accessDecision} user=${userEmail} ip=${clientIp}`,
  };
}

export function generateDlpLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const jobName = `projects/${project.id}/dlpJobs/${randId(8).toLowerCase()}`;
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
  const protoPayload = auditProto({
    methodName: `google.privacy.dlp.v2.DlpService.${action === "INSPECT" ? "CreateDlpJob" : action === "DEIDENTIFY" ? "DeidentifyContent" : "RedactImage"}`,
    serviceName: "dlp.googleapis.com",
    resourceName: jobName,
    principalEmail: randServiceAccount(project),
    authorizationInfo: [
      {
        resource: `//dlp.googleapis.com/${inspectTemplate}`,
        permission: "dlp.inspectTemplates.get",
        granted: !isErr,
      },
    ],
    request: {
      parent: `projects/${project.id}`,
      inspectTemplateName: inspectTemplate,
      requestedOptions: { infoTypes: [{ name: infoType }] },
    },
    response: {
      name: jobName,
      inspectDetails: {
        infoTypeStats: [{ infoType: { name: infoType }, count: findingsCount }],
        processedBytes: bytesScanned,
      },
    },
  });

  return {
    "@timestamp": ts,
    severity: isErr ? "ERROR" : "INFO",
    logName: gcpLogName(project.id, "cloudaudit.googleapis.com/data_access"),
    insertId: randId(16).toLowerCase(),
    resource: {
      type: "dlp_job",
      labels: { project_id: project.id, job_id: jobName.split("/").pop() ?? "job" },
    },
    protoPayload,
    cloud: gcpCloud(region, project, "dlp"),
    gcp: {
      dlp: {
        proto_payload: protoPayload,
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
    message: `dlp.googleapis.com ${action} job=${jobName} findings=${findingsCount}`,
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
  const jsonPayload = {
    uri,
    threatTypes: [threatType],
    confidence: Math.round(confidence * 1000) / 1000,
    platform: platformType,
    clientMetadata: { clientIp: randIp(), userAgent: rand(USER_AGENTS) },
    api: "webrisk.googleapis.com/v1/uris:search",
  };

  return {
    "@timestamp": ts,
    severity: isErr ? "ERROR" : "WARNING",
    logName: gcpLogName(project.id, "webrisk.googleapis.com/lookups"),
    insertId: randId(16).toLowerCase(),
    resource: {
      type: "api",
      labels: { project_id: project.id, service: "webrisk.googleapis.com" },
    },
    jsonPayload,
    cloud: gcpCloud(region, project, "web-risk"),
    gcp: {
      web_risk: {
        json_payload: jsonPayload,
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
    message: `webrisk.googleapis.com/SearchUris ${threatType} confidence=${confidence.toFixed(2)} ${uri}`,
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
  const userEmail = rand([
    `user@${project.id.split("-")[0]}.example.com`,
    `admin@${project.id.split("-")[0]}.example.com`,
  ]);
  const groupName = rand(["engineering", "security", "contractors", "all-staff"]);
  const deviceType = rand(["CHROME_OS", "ANDROID", "IOS", "WINDOWS"] as const);
  const adminActor = rand([`admin@${project.id.split("-")[0]}.example.com`, "system@google.com"]);
  const durationNs = randLatencyMs(40, isErr) * 1e6;
  const protoPayload = auditProto({
    methodName: `admin.googleapis.com/${eventType === "USER_CREATED" ? "directory.users.insert" : "directory.groups.patch"}`,
    serviceName: "admin.googleapis.com",
    resourceName: `customers/C${randId(10)}/users/${userEmail}`,
    principalEmail: adminActor,
    authorizationInfo: [
      {
        resource: `//cloudidentity.googleapis.com/customers/C${randId(8)}`,
        permission: "cloudidentity.users.create",
        granted: !isErr,
      },
    ],
    request: { eventType, targetUser: userEmail, groupKey: groupName, deviceType },
  });

  return {
    "@timestamp": ts,
    severity: isErr ? "ERROR" : "NOTICE",
    logName: gcpLogName(project.id, "cloudaudit.googleapis.com/activity"),
    insertId: randId(16).toLowerCase(),
    resource: {
      type: "cloud_identity_user",
      labels: { project_id: project.id, user: userEmail.split("@")[0] },
    },
    protoPayload,
    cloud: gcpCloud(region, project, "cloud-identity"),
    gcp: {
      cloud_identity: {
        proto_payload: protoPayload,
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
    message: `cloudidentity.googleapis.com/${eventType} user=${userEmail}`,
  };
}

export function generateManagedAdLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const domainName = `${rand(["corp", "globex", "prod"])}.internal`;
  const forestTrust = rand(["INBOUND", "OUTBOUND", "BIDIRECTIONAL", "NONE"] as const);
  const operation = rand([
    "CREATE_DOMAIN",
    "EXTEND_SCHEMA",
    "RESET_PASSWORD",
    "CREATE_BACKUP",
  ] as const);
  const domainControllerIp = `10.${randInt(1, 200)}.${randInt(1, 250)}.${randInt(2, 250)}`;
  const replicationStatus = isErr
    ? rand(["FAILED", "LAGGING"] as const)
    : rand(["HEALTHY", "SYNCED", "IN_PROGRESS"] as const);
  const durationNs = randLatencyMs(500, isErr) * 1e6;
  const jsonPayload = {
    domain: `projects/${project.id}/locations/global/managedMicrosoftAds/${domainName.replace(".", "-")}`,
    operation,
    forestTrustDirection: forestTrust,
    domainControllers: [{ ip: domainControllerIp, site: "Default-First-Site-Name" }],
    replication: { status: replicationStatus, lastSync: ts },
  };

  return {
    "@timestamp": ts,
    severity: isErr ? "ERROR" : "INFO",
    logName: gcpLogName(project.id, "managedidentities.googleapis.com/domain_operations"),
    insertId: randId(16).toLowerCase(),
    resource: { type: "managed_ad_domain", labels: { project_id: project.id, domain: domainName } },
    jsonPayload,
    cloud: gcpCloud(region, project, "managed-ad"),
    gcp: {
      managed_ad: {
        json_payload: jsonPayload,
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
    message: `managedidentities.googleapis.com/${operation} domain=${domainName}`,
  };
}

export function generateOsLoginLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const user = rand([
    `dev@${project.id.split("-")[0]}.example.com`,
    `sre@${project.id}.example.com`,
  ]);
  const methodName = rand([
    "google.cloud.oslogin.v1.OsLoginService.Login",
    "google.cloud.oslogin.v1.OsLoginService.DeletePosixAccount",
    "google.cloud.oslogin.v1.OsLoginService.ImportSshPublicKey",
    "google.cloud.oslogin.v1.OsLoginService.DeleteSshPublicKey",
  ] as const);
  const instance = `vm-${rand(["bastion", "build"])}-${randId(4).toLowerCase()}`;
  const sshKeyFingerprint = `SHA256:${Array.from({ length: 44 }, () => randInt(0, 15).toString(16)).join("")}`;
  const loginMethod = rand(["SSH_KEY", "OS_LOGIN_2FA"] as const);
  const durationNs = randLatencyMs(30, isErr) * 1e6;
  const protoPayload = auditProto({
    methodName,
    serviceName: "oslogin.googleapis.com",
    resourceName: `users/${user}/projects/${project.id}`,
    principalEmail: user,
    authorizationInfo: [
      {
        resource: `//compute.googleapis.com/projects/${project.id}/zones/${region}-a/instances/${instance}`,
        permission: "compute.instances.osLogin",
        granted: !isErr,
      },
    ],
    request: { parent: `users/${user}`, keyFingerprint: sshKeyFingerprint, loginMethod },
  });

  return {
    "@timestamp": ts,
    severity: isErr ? "ERROR" : "INFO",
    logName: gcpLogName(project.id, "cloudaudit.googleapis.com/data_access"),
    insertId: randId(16).toLowerCase(),
    resource: {
      type: "gce_instance",
      labels: { project_id: project.id, instance_id: instance, zone: `${region}-a` },
    },
    protoPayload,
    cloud: gcpCloud(region, project, "os-login"),
    gcp: {
      os_login: {
        proto_payload: protoPayload,
        user,
        action: methodName.split(".").pop(),
        instance,
        ssh_key_fingerprint: sshKeyFingerprint,
        login_method: loginMethod,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: durationNs,
    },
    message: `oslogin.googleapis.com ${methodName} user=${user} instance=${instance}`,
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
  const jsonPayload = {
    case: {
      name: `projects/${project.id}/locations/global/cases/${caseId}`,
      displayName: `Investigation ${caseId}`,
      stage: rand(["OPEN", "IN_PROGRESS", "CLOSED"]),
      priority: isErr ? "HIGH" : severity,
    },
    playbook: { name: playbookName, revisionId: `rev_${randId(6)}` },
    action: {
      type: actionType,
      entitiesTouched: entitiesCount,
      indicatorsTouched: indicatorsCount,
    },
    siem: {
      product: "Google Security Operations",
      instance: `projects/${project.id}/locations/global`,
    },
  };

  return {
    "@timestamp": ts,
    severity: isErr ? "ERROR" : severity === "CRITICAL" ? "ALERT" : "NOTICE",
    logName: gcpLogName(project.id, "chronicle.googleapis.com/soar_events"),
    insertId: randId(16).toLowerCase(),
    resource: {
      type: "security_operations_case",
      labels: { project_id: project.id, case_id: caseId },
    },
    jsonPayload,
    cloud: gcpCloud(region, project, "security-operations"),
    gcp: {
      security_operations: {
        json_payload: jsonPayload,
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
    message: `securityoperations.googleapis.com/${actionType} case=${caseId} playbook=${playbookName}`,
  };
}

export function generateAccessTransparencyLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const product = rand([
    "GMAIL",
    "DRIVE",
    "MEET",
    "CALENDAR",
    "GCP",
    "BigQuery",
    "Cloud Storage",
    "Cloud KMS",
  ] as const);
  const accessReason = rand([
    "CUSTOMER_INITIATED_SUPPORT",
    "GOOGLE_INITIATED_REVIEW",
    "THIRD_PARTY_DATA_REQUEST",
    "LEGAL_REQUEST",
  ] as const);
  const accessorEmail = `google-support-${randId(4)}@google.com`;
  const justification = rand([
    "Troubleshooting customer-reported outage",
    "Abuse and fraud investigation",
    "Legal process compliance review",
  ]);
  const accessDurationSeconds = randInt(60, isErr ? 3600 : 7200);
  const severity = isErr ? "ERROR" : randSeverity(false);
  const principalEmail = randServiceAccount(project);
  const logName = `projects/${project.id}/logs/${encodeURIComponent("cloudaudit.googleapis.com/access_transparency")}`;
  const jsonPayload = {
    id: `AX-${randId(12)}`,
    actor: { email: accessorEmail, title: "Support Engineer" },
    target: { customerId: `C${randId(10)}`, projectNumber: project.number },
    product,
    reason: accessReason,
    action: rand(["DATA_ACCESS", "CONFIGURATION_CHANGE", "ACCOUNT_RECOVERY"]),
    status: isErr ? "FAILED" : "COMPLETED",
    ipAddress: randIp(),
    justification,
    accessDurationSeconds,
  };
  const message = isErr
    ? `cloudaudit.googleapis.com/access_transparency ${product} status=FAILED: partial export`
    : `cloudaudit.googleapis.com/access_transparency ${accessReason} ${product} by ${accessorEmail}`;

  return {
    "@timestamp": ts,
    severity,
    logName,
    insertId: randId(16).toLowerCase(),
    resource: { type: "project", labels: { project_id: project.id } },
    jsonPayload,
    labels: { "resource.type": "accessapproval.googleapis.com/Note", product },
    cloud: gcpCloud(region, project, "accessapproval.googleapis.com"),
    gcp: {
      access_transparency: {
        json_payload: jsonPayload,
        product,
        access_reason: accessReason,
        accessor_email: accessorEmail,
        principal_email: principalEmail,
        justification,
        access_duration_seconds: accessDurationSeconds,
        status: jsonPayload.status,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: accessDurationSeconds * 1000,
    },
    message,
  };
}
