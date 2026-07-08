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
  IAM_USERS,
  randIamUser,
  randEmail,
  randAppDomain,
  FIRST_NAMES,
  LAST_NAMES,
} from "../../helpers";
import type { EcsDocument } from "./types.js";

function generateWorkSpacesLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const user = randIamUser();
  const wsId = `ws-${randId(10).toLowerCase()}`;
  const directoryId = `d-${randId(10).toLowerCase()}`;
  const action = rand([
    "Connect",
    "Disconnect",
    "StartWorkspace",
    "StopWorkspace",
    "RebuildWorkspace",
    "Login",
    "Logout",
    "SessionMetrics",
    "WSPStreamEvent",
    "UserActivity",
  ]);
  const state = isErr
    ? rand(["ERROR", "UNHEALTHY", "STOPPED"])
    : rand(["AVAILABLE", "AVAILABLE", "CONNECTED"]);
  const rttMs = isErr ? randInt(200, 2000) : randInt(8, 80);
  const packetLossPct = isErr ? Number(randFloat(2, 25)) : Number(randFloat(0, 0.8));
  const wspEvent = rand([
    "channel_connected",
    "frame_decode",
    "usb_redirection",
    "display_mode_change",
  ]);
  const structured = {
    eventType: action,
    directoryId,
    workspaceId: wsId,
    userName: user,
    timestamp: new Date(ts).toISOString(),
    ...(action === "Login" || action === "Logout"
      ? { authResult: isErr ? "FAILURE" : "SUCCESS", clientIp: randIp() }
      : {}),
    ...(action === "SessionMetrics"
      ? {
          connectionQuality: {
            roundTripTimeMs: rttMs,
            packetLossPercent: packetLossPct,
            sessionSetupTimeMs: randInt(500, 8000),
          },
        }
      : {}),
    ...(action === "WSPStreamEvent"
      ? { streamingProtocol: "WSP", wspEvent, encoder: rand(["H264", "AVC420", "HEVC"]) }
      : {}),
    ...(action === "UserActivity"
      ? {
          activity: rand(["idle_timeout_reset", "clipboard_sync", "file_upload", "display_lock"]),
          resourceId: rand(["Desktop", "RemovableMedia", "Printer"]),
        }
      : {}),
  };
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "workspaces" },
    },
    aws: {
      dimensions: { DirectoryId: directoryId, WorkspaceId: wsId },
      workspaces: {
        workspace_id: wsId,
        user_name: user,
        bundle_type: rand(["Performance", "Standard", "Power", "Graphics"]),
        workspace_state: state,
        action,
        compute_type: rand(["VALUE", "STANDARD", "PERFORMANCE", "POWER"]),
        running_mode: rand(["AUTO_STOP", "ALWAYS_ON"]),
        client_ip: randIp(),
        client_os: rand(["Windows 11", "macOS 14", "Ubuntu 22.04"]),
        error_code: isErr ? rand(["InvalidUser", "OperationNotSupportedException"]) : null,
        round_trip_time_ms: action === "SessionMetrics" ? rttMs : null,
        packet_loss_percent: action === "SessionMetrics" ? packetLossPct : null,
        wsp_event: action === "WSPStreamEvent" ? wspEvent : null,
      },
    },
    user: { name: user },
    source: { ip: randIp() },
    event: {
      action,
      outcome: isErr ? "failure" : "success",
      category: ["host", "session"],
      dataset: "aws.workspaces",
      provider: "workspaces.amazonaws.com",
      duration: randInt(100, isErr ? 10000 : 5000) * 1e6,
    },
    message: JSON.stringify({
      ...structured,
      timestamp: new Date(ts).toISOString(),
      ...(isErr ? { status: "Failed" } : { status: "Succeeded" }),
    }),
    ...(isErr
      ? {
          error: {
            code: rand([
              "InvalidParameterValuesException",
              "ResourceNotFoundException",
              "AccessDeniedException",
              "UnsupportedWorkspaceConfigurationException",
            ]),
            message: rand([
              "WorkSpaces could not modify workspace because the directory state is invalid",
              "The specified WorkSpace could not be found in this Region",
              "User is not authorized to perform workspaces:RebootWorkspaces on resource",
              "The bundleId and root volume encryption parameters are mutually incompatible",
            ]),
            type: "aws",
          },
        }
      : {}),
    log: { level: isErr ? "error" : "info" },
  };
}

function generateConnectLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const instanceId =
    `${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`.toLowerCase();
  const initiationMethod = rand([
    "INBOUND",
    "OUTBOUND",
    "API",
    "TRANSFER",
    "QUEUE_TRANSFER",
    "MONITOR",
  ]);
  const channel = rand(["VOICE", "CHAT", "TASK"]);
  const queueName = rand(["BasicQueue", "TechSupport", "Billing", "Sales", "Priority-Enterprise"]);
  const agent = rand([`agent-${randIamUser()}`, `agent-${randIamUser()}`, null]);
  const dur = randInt(10, 1800);
  const sentiment = rand(["POSITIVE", "NEUTRAL", "NEGATIVE", "MIXED"]);
  const contactId = `${randId(8)}-${randId(4)}-${randId(4)}`.toLowerCase();
  const initiationTs = new Date(new Date(ts).getTime() - dur * 1000).toISOString();
  const disconnectTs = new Date(ts).toISOString();
  const agentConnectSec = dur <= 2 ? 1 : randInt(1, dur - 1);
  const dequeueSec = dur <= 3 ? 1 : randInt(1, dur - 2);
  const customerPhone = `+1${randInt(2000000000, 9999999999)}`;
  const systemPhone = `+1800${randInt(1000000, 9999999)}`;
  const ctr = {
    ContactId: contactId,
    AWSAccountId: acct.id,
    InstanceARN: `arn:aws:connect:${region}:${acct.id}:instance/${instanceId}`,
    Channel: channel,
    InitiationMethod: initiationMethod,
    InitiationTimestamp: initiationTs,
    DisconnectTimestamp: disconnectTs,
    LastUpdateTimestamp: disconnectTs,
    TotalPauseCount: randInt(0, 5),
    Queue: {
      ARN: `arn:aws:connect:${region}:${acct.id}:instance/${instanceId}/queue/${randId(10)}`,
      Name: queueName,
      EnqueueTimestamp: new Date(
        new Date(ts).getTime() - (dur - randInt(0, Math.min(120, dur - 1))) * 1000
      ).toISOString(),
      DequeueTimestamp: new Date(new Date(ts).getTime() - dequeueSec * 1000).toISOString(),
    },
    AgentInfo: agent
      ? {
          Id: `arn:aws:connect:${region}:${acct.id}:instance/${instanceId}/agent/${randId(8)}`,
          ConnectedToAgentTimestamp: new Date(
            new Date(ts).getTime() - agentConnectSec * 1000
          ).toISOString(),
          Username: agent,
          AfterContactWorkDuration: randInt(0, 300),
        }
      : {},
    CustomerEndpoint: {
      Type: channel === "CHAT" ? "EMAIL" : "TELEPHONE_NUMBER",
      Address: customerPhone,
    },
    SystemEndpoint: { Type: "TELEPHONE_NUMBER", Address: systemPhone },
    InitialContactId: null,
    PreviousContactId: null,
    InitiationDurationSeconds: randInt(0, 45),
    AfterContactWorkDuration: randInt(0, 300),
    ContactDuration: dur,
    DisconnectReason: rand(["CUSTOMER_DISCONNECT", "AGENT_DISCONNECT", "OTHER", "FLOW_ERROR"]),
    Tags: { department: rand(["support", "sales", "billing"]) },
  };
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "connect" },
    },
    aws: {
      dimensions: { InstanceId: instanceId, MetricGroup: "Queue" },
      connect: {
        instance_id: instanceId,
        contact_id: contactId,
        channel,
        initiation_method: initiationMethod,
        queue_name: queueName,
        agent_id: agent,
        duration_seconds: dur,
        hold_duration_seconds: randInt(0, 120),
        queue_wait_time_seconds: randInt(0, 300),
        disconnect_reason: rand(["CUSTOMER_DISCONNECT", "AGENT_DISCONNECT", "EXPIRED"]),
        sentiment_overall: sentiment,
        contact_lens_enabled: Math.random() > 0.5,
        lex_bot_interacted: Math.random() > 0.5,
        initiation_timestamp: initiationTs,
        disconnect_timestamp: disconnectTs,
        customer_endpoint: customerPhone,
        system_endpoint: systemPhone,
        error_code: isErr ? rand(["ContactNotFoundException", "QueueCapacityExceeded"]) : null,
      },
    },
    event: {
      duration: dur * 1e9,
      outcome: isErr ? "failure" : "success",
      category: ["host", "session"],
      dataset: "aws.connect",
      provider: "connect.amazonaws.com",
    },
    message: JSON.stringify(ctr),
    ...(isErr
      ? {
          error: {
            code: rand([
              "ContactNotFoundException",
              "ServiceQuotaExceededException",
              "InvalidRequestException",
              "DuplicateResourceException",
            ]),
            message: rand([
              "The contact ARN you specified is not valid or has been deleted",
              "Connect instance queue depth exceeded the account service quota",
              "StartContact API request failed AWS parameter validation",
              "A contact with the same idempotency token is already in progress",
            ]),
            type: "aws",
          },
        }
      : {}),
    log: { level: isErr ? "error" : dur > 600 ? "warn" : "info" },
  };
}

function generateAppStreamLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const stack = rand([
    "dev-tools-stack",
    "design-apps",
    "data-analytics",
    "browser-isolation",
    "secure-access",
  ]);
  const fleet = rand(["on-demand-fleet", "always-on-fleet", "elastic-fleet"]);
  const user = `user_${randId(8).toLowerCase()}@company.com`;
  const event = rand([
    "SESSION_STARTED",
    "SESSION_ENDED",
    "APPLICATION_LAUNCHED",
    "FILE_DOWNLOAD",
    "FILE_UPLOAD",
    "CLIPBOARD_COPY",
    "CAPACITY_CHANGED",
  ]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "appstream" },
    },
    aws: {
      appstream: {
        stack_name: stack,
        fleet_name: fleet,
        user_id: user,
        session_id: randId(36).toLowerCase(),
        event_type: event,
        application_name: event.includes("APP")
          ? rand(["Notepad++", "MATLAB", "AutoCAD", "Chrome", "VS Code", "Tableau"])
          : null,
        instance_type: rand([
          "stream.standard.medium",
          "stream.compute.large",
          "stream.memory.xlarge",
        ]),
        session_duration_minutes: event.includes("ENDED") ? randInt(1, 480) : null,
        storage_connector: rand([null, "HomeFolder", "OneDrive", "GoogleDrive"]),
        idle_disconnect_timeout_minutes: rand([15, 30, 60]),
        max_user_duration_hours: rand([2, 4, 8, 12]),
        error_code: isErr
          ? rand(["FLEET_CAPACITY_EXCEEDED", "IAM_SERVICE_ROLE_ERROR", "USER_NOT_AUTHORIZED"])
          : null,
      },
    },
    user: { name: user },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["host", "session"],
      dataset: "aws.appstream",
      provider: "appstream2.amazonaws.com",
      duration: randInt(100, isErr ? 30000 : 5000) * 1e6,
    },
    message: JSON.stringify({
      timestamp: new Date(ts).toISOString(),
      ...(isErr ? { status: "Failed" } : { status: "Succeeded" }),
    }),
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand([
              "FLEET_CAPACITY_EXCEEDED",
              "IAM_SERVICE_ROLE_ERROR",
              "USER_NOT_AUTHORIZED",
            ]),
            message: "AppStream operation failed",
            type: "aws",
          },
        }
      : {}),
  };
}

function generateGameLiftLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const fleet = rand([
    "game-fleet-prod",
    "matchmaking-fleet",
    "us-east-realtime",
    "eu-west-battle",
  ]);
  const fleetId = `fleet-${randId(8).toLowerCase()}`;
  const location = rand(["us-east-1", "us-west-2", "eu-west-1", "ap-northeast-1"]);
  const event = rand([
    "GameSessionCreated",
    "PlayerSessionCreated",
    "PlayerSessionTerminated",
    "FleetCapacityChanged",
    "InstanceStatusChanged",
    "MatchmakingSucceeded",
    "MatchmakingTimedOut",
  ]);
  const gameSessionId = `arn:aws:gamelift:${region}::gamesession/${fleet}/${randId(36).toLowerCase()}`;
  const eventDurMs = randInt(100, isErr ? 30000 : 7200000);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "gamelift" },
    },
    aws: {
      dimensions: {
        FleetId: fleetId,
        Location: location,
        MetricGroups: "All",
        OperatingSystem: rand(["AMAZON_LINUX_2", "WINDOWS_2012"]),
      },
      gamelift: {
        fleet_id: fleetId,
        fleet_name: fleet,
        event_type: event,
        game_session_id: gameSessionId,
        player_session_id: event.includes("Player") ? `psess-${randId(36).toLowerCase()}` : null,
        current_player_sessions: randInt(0, 100),
        maximum_player_sessions: rand([10, 50, 100, 200]),
        instance_type: rand(["c5.large", "c5.xlarge", "c5.2xlarge", "m5.large"]),
        instance_count: randInt(1, 50),
        desired_instances: randInt(1, 50),
        idle_instances: randInt(0, 10),
        matchmaking_configuration: rand(["FastMatch", "BalancedMatch", "RegionalMatch"]),
        matchmaking_ticket_id: event.includes("Matchmaking") ? randId(36).toLowerCase() : null,
        matchmaking_duration_seconds: event.includes("Matchmaking") ? randInt(5, 120) : null,
        error_code: isErr
          ? rand(["InvalidFleetStatus", "FleetCapacityExceeded", "InvalidGameSession"])
          : null,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process", "network"],
      dataset: "aws.gamelift",
      provider: "gamelift.amazonaws.com",
      duration: eventDurMs * 1e6,
    },
    message: JSON.stringify({
      timestamp: new Date(ts).toISOString(),
      ...(isErr ? { status: "Failed" } : { status: "Succeeded" }),
    }),
    log: { level: isErr ? "error" : event.includes("TimedOut") ? "warn" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand([
              "InvalidFleetStatusException",
              "FleetCapacityExceededException",
              "InvalidGameSessionException",
            ]),
            message: "GameLift operation failed",
            type: "aws",
          },
        }
      : {}),
  };
}

function generateSesLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const eventType = rand([
    "Send",
    "Delivery",
    "Bounce",
    "Complaint",
    "Open",
    "Click",
    "Reject",
    "RenderingFailure",
  ]);
  const from = rand(["noreply@company.com", "alerts@company.com", "no-reply@app.io"]);
  const fromDomain = from.split("@")[1];
  const to = `user_${randId(6).toLowerCase()}@${rand(["gmail.com", "yahoo.com", "company.org", "outlook.com"])}`;
  const destList = [to, `archive+${randId(4)}@company.org`].slice(0, randInt(1, 2));
  const toCountry = rand(["US", "GB", "DE", "FR", "AU", "CA", "JP"]);
  const toIsp = rand(["Gmail", "Yahoo", "Hotmail", "AOL", "Other"]);
  const configSet = rand(["transactional", "marketing", "alerts", null]);
  const msgId = `${randId(20)}.${randId(10)}@${region}.amazonses.com`.toLowerCase();
  const bounceType = eventType === "Bounce" ? rand(["Permanent", "Transient"]) : null;
  const bounceSubType = bounceType
    ? rand(["General", "NoEmail", "Suppressed", "MailboxFull", "MessageTooLarge"])
    : null;
  const sesNotification = {
    eventType,
    mail: {
      timestamp: new Date(ts).toISOString(),
      messageId: msgId,
      source: from,
      sourceArn: `arn:aws:ses:${region}:${acct.id}:identity/${fromDomain}`,
      sendingAccountId: acct.id,
      destination: destList,
      headersTruncated: false,
      commonHeaders: {
        from: [from],
        to: destList,
        subject: rand(["Your order", "Security alert", "Weekly digest"]),
        messageId: `<${msgId}>`,
      },
      tags: {
        "ses:configuration-set": configSet ? [configSet] : [],
        "ses:source-ip": [randIp()],
        "ses:outgoing-ip": [
          `${randInt(1, 223)}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`,
        ],
      },
    },
    ...(eventType === "Bounce"
      ? {
          bounce: {
            bounceType,
            bounceSubType,
            bouncedRecipients: [
              {
                emailAddress: to,
                action: "failed",
                status: bounceType === "Permanent" ? "5.1.1" : "4.2.2",
                diagnosticCode: `smtp; ${rand([550, 552, 421])} ${rand(["user unknown", "mailbox full"])}`,
              },
            ],
            timestamp: new Date(ts).toISOString(),
            feedbackId: `${randId(8)}-${region}-${acct.id}`,
          },
        }
      : {}),
    ...(eventType === "Complaint"
      ? {
          complaint: {
            complainedRecipients: [{ emailAddress: to }],
            timestamp: new Date(ts).toISOString(),
            feedbackId: `${randId(8)}-${region}-${acct.id}`,
            complaintFeedbackType: rand(["abuse", "fraud", "virus", "not-spam"]),
            userAgent: rand(["Yahoo!-Mail-Feedback/1.0", "Hotmail FBL"]),
          },
        }
      : {}),
    ...(eventType === "Delivery"
      ? {
          delivery: {
            timestamp: new Date(ts).toISOString(),
            processingTimeMillis: randInt(50, 3000),
            recipients: destList,
            smtpResponse: "250 2.0.0 OK",
            reportingMTA: `a${randInt(1, 9)}-${randId(4)}.smtp-out.${region}.amazonses.com`,
          },
        }
      : {}),
    ...(eventType === "Open" || eventType === "Click"
      ? {
          [eventType.toLowerCase()]: {
            timestamp: new Date(ts).toISOString(),
            userAgent: rand(USER_AGENTS),
            ipAddress: randIp(),
            ...(eventType === "Click"
              ? { link: `https://${randAppDomain()}/track/${randId(8)}` }
              : {}),
          },
        }
      : {}),
    ...(eventType === "Reject" || eventType === "RenderingFailure"
      ? {
          failure: {
            errorMessage: rand(["Message rejected", "Template rendering failed"]),
            templateName:
              eventType === "RenderingFailure" ? rand(["welcome", "receipt"]) : undefined,
          },
        }
      : {}),
  };
  const message = JSON.stringify(sesNotification);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "ses" },
    },
    aws: {
      dimensions: {
        "ses:configuration-set": configSet || "default",
        "ses:from-domain": fromDomain,
        "ses:to-country": toCountry,
        "ses:to-isp": toIsp,
      },
      ses: {
        message_id: msgId,
        event_type: eventType,
        from_address: from,
        destination: destList,
        configuration_set: configSet,
        bounce: {
          bounce_type: bounceType,
          bounce_sub_type: bounceSubType,
          bounced_recipients:
            eventType === "Bounce"
              ? [
                  {
                    emailAddress: to,
                    action: "failed",
                    status: bounceType === "Permanent" ? "5.1.1" : "4.2.2",
                  },
                ]
              : [],
        },
        complaint: {
          feedback_type:
            eventType === "Complaint" ? rand(["abuse", "fraud", "virus", "not-spam"]) : null,
          complained_recipients: eventType === "Complaint" ? [{ emailAddress: to }] : [],
        },
        sending_account_id: `${acct.id}`,
        delivery: {
          recipients: destList,
          timestamp: ts,
          processing_time_ms: randInt(50, 3000),
          smtp_response: isErr ? null : "250 2.0.0 OK",
        },
      },
    },
    event: {
      outcome:
        isErr || ["Bounce", "Complaint", "Reject"].includes(eventType) ? "failure" : "success",
      category: ["email", "process"],
      dataset: "aws.ses",
      provider: "email.amazonaws.com",
      duration: randInt(50, isErr ? 5000 : 3000) * 1e6,
    },
    message,
    log: {
      level: ["Bounce", "Complaint", "Reject"].includes(eventType)
        ? "warn"
        : isErr
          ? "error"
          : "info",
    },
    ...(isErr || ["Bounce", "Complaint", "Reject"].includes(eventType)
      ? {
          error: {
            code: rand([
              "MessageRejected",
              "MailFromDomainNotVerifiedException",
              "LimitExceededException",
              "SendingPausedException",
            ]),
            message: rand([
              "SES rejected the message because the MAIL FROM domain is not verified",
              "Account sending is paused due to bounce or complaint rate thresholds",
              "Maximum sending rate exceeded for this SES configuration set",
              "Rendering template data failed KMS decrypt of nested attribute",
            ]),
            type: "aws",
          },
        }
      : {}),
  };
}

function generatePinpointLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const channel = rand(["EMAIL", "SMS", "PUSH", "IN_APP", "VOICE"]);
  const event = rand([
    "_email.send",
    "_email.delivered",
    "_email.bounced",
    "_sms.sent",
    "_sms.buffered",
    "_push.notification_received",
    "_campaign.send",
    "_journey.send",
    "_custom.purchase",
  ]);
  const campaign = rand([
    "welcome-series",
    "re-engagement",
    "promo-black-friday",
    "onboarding-flow",
    "churn-prevention",
  ]);
  const user = `user_${randId(10).toLowerCase()}`;
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "pinpoint" },
    },
    aws: {
      pinpoint: {
        application_id: randId(32).toLowerCase(),
        event_type: event,
        channel,
        campaign_id: randId(24).toLowerCase(),
        campaign_name: campaign,
        journey_id: randId(24).toLowerCase(),
        segment_id: randId(24).toLowerCase(),
        endpoint_id: user,
        message_id: randId(36).toLowerCase(),
        delivery_status: isErr
          ? "DUPLICATE"
          : rand(["SUCCESSFUL", "SUCCESSFUL", "PENDING", "FAILED"]),
        status_message: isErr ? "Address on suppression list" : null,
        destination:
          channel === "EMAIL"
            ? randEmail(user)
            : channel === "SMS"
              ? `+1555${randInt(1000000, 9999999)}`
              : user,
        iso_country_code: rand(["US", "GB", "DE", "FR", "AU"]),
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.pinpoint",
      provider: "mobiletargeting.amazonaws.com",
      duration: randInt(50, isErr ? 5000 : 2000) * 1e6,
    },
    message: JSON.stringify({
      timestamp: new Date(ts).toISOString(),
      ...(isErr ? { status: "Failed" } : { status: "Succeeded" }),
    }),
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand(["TooManyRequestsException", "BadRequestException", "ForbiddenException"]),
            message: "Pinpoint delivery failed",
            type: "aws",
          },
        }
      : {}),
  };
}

function generateTransferFamilyLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const protocol = rand(["SFTP", "FTPS", "FTP", "AS2"]);
  const serverId = `s-${randId(17).toLowerCase()}`;
  const user = rand([
    "sftp-partner",
    "data-ingest",
    "backup-user",
    "etl-transfer",
    "vendor-upload",
  ]);
  const file = rand([
    "/inbound/orders.csv",
    "/uploads/inventory.xml",
    "/reports/daily-sales.xlsx",
    "/backup/db-export.sql.gz",
    "/data/events.json",
  ]);
  const bytes = randInt(1024, 5e9);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "transferfamily" },
    },
    aws: {
      dimensions: { ServerId: serverId, Protocol: protocol },
      transferfamily: {
        server_id: serverId,
        protocol,
        user_name: user,
        session_id: randId(32).toLowerCase(),
        file_path: file,
        operation: rand(["PUT", "GET", "DELETE", "MKDIR", "RENAME"]),
        bytes_transferred: bytes,
        transfer_rate_mbps: Number(randFloat(0.1, 500)),
        duration_seconds: Number(randFloat(0.1, 300)),
        s3_bucket: rand(["sftp-inbound", "partner-data", "transfer-landing"]),
        as2_message_id: protocol === "AS2" ? randId(36).toLowerCase() : null,
        error_code: isErr
          ? rand(["AUTH_FAILURE", "PERMISSION_DENIED", "CONNECTION_RESET", "FILE_NOT_FOUND"])
          : null,
      },
    },
    source: { ip: randIp() },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["file", "network"],
      dataset: "aws.transfer",
      provider: "transfer.amazonaws.com",
      duration: randInt(100, isErr ? 300000 : 30000) * 1e6,
    },
    message: JSON.stringify({
      timestamp: new Date(ts).toISOString(),
      ...(isErr ? { status: "Failed" } : { status: "Succeeded" }),
    }),
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand([
              "ServiceUnavailableException",
              "InvalidRequestException",
              "AccessDeniedException",
              "ResourceNotFoundException",
            ]),
            message: "Transfer Family operation failed",
            type: "aws",
          },
        }
      : {}),
  };
}

function generateLightsailLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const instance = rand([
    "wordpress-prod",
    "dev-server",
    "game-server",
    "portfolio-site",
    "api-prototype",
  ]);
  const event = rand([
    "INSTANCE_STATE_CHANGE",
    "SNAPSHOT_CREATED",
    "STATIC_IP_ATTACHED",
    "ALERT_TRIGGERED",
    "MONTHLY_TRANSFER_EXCEEDED",
    "SSL_RENEWED",
  ]);
  const state = isErr ? "ERROR" : rand(["running", "stopped", "pending"]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "lightsail" },
    },
    aws: {
      lightsail: {
        resource_name: instance,
        resource_type: rand(["Instance", "Database", "Bucket", "ContainerService", "Distribution"]),
        bundle_id: rand(["nano_2_0", "micro_2_0", "small_2_0", "medium_2_0", "large_2_0"]),
        blueprint: rand([
          "wordpress",
          "lamp",
          "nodejs",
          "django",
          "ubuntu_22_04",
          "amazon_linux_2",
        ]),
        state,
        event_type: event,
        public_ip: randIp(),
        snapshot_name: event.includes("SNAPSHOT") ? `${instance}-snap-${randInt(1, 100)}` : null,
        monthly_transfer: { used_gb: randInt(0, 2000), limit_gb: rand([1024, 3072, 6144, 12288]) },
        alert: {
          name:
            event === "ALERT_TRIGGERED"
              ? rand(["CPUUtilization", "NetworkOut", "StatusCheckFailed"])
              : null,
          threshold: event === "ALERT_TRIGGERED" ? randInt(80, 100) : null,
        },
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["host", "network"],
      dataset: "aws.lightsail",
      provider: "lightsail.amazonaws.com",
      duration: randInt(100, isErr ? 10000 : 2000) * 1e6,
    },
    message: JSON.stringify({
      timestamp: new Date(ts).toISOString(),
      ...(isErr ? { status: "Failed" } : { status: "Succeeded" }),
    }),
    log: { level: isErr ? "error" : event.includes("EXCEEDED") ? "warn" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand([
              "AccessDeniedException",
              "InvalidInputException",
              "NotFoundException",
              "ServiceException",
            ]),
            message: "Lightsail instance error",
            type: "aws",
          },
        }
      : {}),
  };
}

function generateFraudDetectorLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const model = rand([
    "online-fraud-v2",
    "account-takeover",
    "card-fraud-detector",
    "identity-fraud",
    "transaction-risk",
  ]);
  const entity = `entity_${randId(10).toLowerCase()}`;
  const outcome = isErr ? rand(["BLOCK", "HIGH_RISK"]) : rand(["APPROVE", "REVIEW", "APPROVE"]);
  const score = isErr
    ? randInt(800, 999)
    : rand([outcome === "REVIEW" ? randInt(400, 799) : randInt(0, 399)]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "frauddetector" },
    },
    aws: {
      dimensions: { DetectorId: model },
      frauddetector: {
        detector_id: model,
        detector_version_id: randInt(1, 5).toString(),
        event_id: randId(36).toLowerCase(),
        event_type: rand([
          "account_registration",
          "online_purchase",
          "login",
          "wire_transfer",
          "card_transaction",
        ]),
        entity_type: "customer",
        entity_id: entity,
        outcomes: [outcome],
        risk_score: score,
        model_scores: { [model]: score },
        used_rules: rand([["block-high-risk"], ["review-medium"], ["approve-low"]]),
        ip_address: randIp(),
        event_variables: {
          billing_postal: randInt(10000, 99999).toString(),
          phone_verified: rand(["true", "false"]),
        },
      },
    },
    event: {
      outcome: outcome === "BLOCK" ? "failure" : "success",
      category: ["intrusion_detection", "process"],
      dataset: "aws.frauddetector",
      provider: "frauddetector.amazonaws.com",
      duration: randInt(50, isErr ? 3000 : 500) * 1e6,
    },
    message: JSON.stringify({
      timestamp: new Date(ts).toISOString(),
      ...(isErr ? { status: "Failed" } : { status: "Succeeded" }),
    }),
    log: { level: outcome === "BLOCK" ? "warn" : outcome === "HIGH_RISK" ? "warn" : "info" },
    ...(outcome === "BLOCK"
      ? {
          error: {
            code: rand(["AccessDeniedException", "ValidationException", "ConflictException"]),
            message:
              "Fraud Detector invoked GetEventPrediction and returned an outcome that blocks the caller path",
            type: "aws",
          },
        }
      : {}),
  };
}

function generateLocationServiceLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const operation = rand([
    "SearchPlaceIndex",
    "CalculateRoute",
    "BatchEvaluateGeofences",
    "GetDevicePosition",
    "UpdateDevicePosition",
    "ListGeofences",
    "CreateRouteCalculator",
  ]);
  const tracker = rand([
    "fleet-tracker",
    "delivery-devices",
    "asset-monitor",
    "field-worker-track",
  ]);
  const deviceId = `device-${randId(8).toLowerCase()}`;
  const lat = Number(randFloat(-90, 90));
  const lon = Number(randFloat(-180, 180));
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "location" },
    },
    aws: {
      dimensions: { Operation: operation },
      locationservice: {
        operation,
        tracker_name: operation.includes("Device") ? tracker : null,
        geofence_collection: operation.includes("Geofence")
          ? rand(["delivery-zones", "restricted-areas", "customer-sites"])
          : null,
        place_index: operation.includes("Place")
          ? rand(["here-place-index", "esri-place-index"])
          : null,
        route_calculator: operation.includes("Route")
          ? rand(["truck-router", "walking-calculator"])
          : null,
        device_id: operation.includes("Device") ? deviceId : null,
        position: operation.includes("Device") ? { lat, lon } : null,
        query: operation.includes("Search")
          ? rand(["coffee shop", "gas station", "hospital", "airport"])
          : null,
        distance_meters: operation.includes("Route") ? randInt(100, 500000) : null,
        duration_seconds: operation.includes("Route") ? randInt(60, 18000) : null,
        geofence_ids_entered: operation.includes("Geofences") ? randInt(0, 3) : null,
        geofence_ids_exited: operation.includes("Geofences") ? randInt(0, 2) : null,
        error_code: isErr
          ? rand(["ResourceNotFoundException", "ThrottlingException", "ValidationException"])
          : null,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process", "network"],
      dataset: "aws.location",
      provider: "geo.amazonaws.com",
      duration: randInt(10, isErr ? 5000 : 500) * 1e6,
    },
    message: JSON.stringify({
      timestamp: new Date(ts).toISOString(),
      ...(isErr ? { status: "Failed" } : { status: "Succeeded" }),
    }),
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand(["ResourceNotFoundException", "ThrottlingException", "ValidationException"]),
            message: "Location Service failed",
            type: "aws",
          },
        }
      : {}),
  };
}

function generateMediaConvertLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const jobId = `${randInt(1234567890, 9999999999)}-${randId(6).toLowerCase()}`;
  const input = rand([
    "s3://media-input/raw/interview.mov",
    "s3://media-input/broadcast/live.mxf",
    "s3://uploads/user-video.mp4",
  ]);
  const outputGroup = rand(["HLS", "DASH", "MP4", "CMAF"]);
  const dur = randInt(30, isErr ? 3600 : 1800);
  const audioMins = Number(randFloat(0.5, 120));
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "mediaconvert" },
    },
    aws: {
      dimensions: { Operation: outputGroup },
      mediaconvert: {
        job_id: jobId,
        queue_arn: `arn:aws:mediaconvert:${region}:${acct.id}:queues/${rand(["Default", "premium", "batch"])}`,
        job_status: isErr ? "ERROR" : "COMPLETE",
        output_group_type: outputGroup,
        input_file: input,
        input_duration_minutes: audioMins,
        video_codec: rand(["H_264", "H_265", "AV1", "MPEG2"]),
        audio_codec: rand(["AAC", "MP3", "AC3"]),
        width: rand([1280, 1920, 3840]),
        height: rand([720, 1080, 2160]),
        bitrate_kbps: rand([1500, 3000, 5000, 8000]),
        duration_seconds: dur,
        error_message: isErr
          ? rand(["Invalid input file", "Unsupported codec", "Output permissions denied"])
          : null,
      },
    },
    event: {
      duration: dur * 1e9,
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.mediaconvert",
      provider: "mediaconvert.amazonaws.com",
    },
    message: JSON.stringify({
      timestamp: new Date(ts).toISOString(),
      ...(isErr ? { status: "Failed" } : { status: "Succeeded" }),
    }),
    ...(isErr
      ? {
          error: {
            code: rand([
              "BadRequestException",
              "ForbiddenException",
              "InternalServerException",
              "ConflictException",
            ]),
            message: "MediaConvert job failed",
            type: "aws",
          },
        }
      : {}),
    log: { level: isErr ? "error" : "info" },
  };
}

function generateMediaLiveLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const channel = rand(["live-news", "sports-event-1", "concert-stream", "corporate-broadcast"]);
  const channelId = randId(11);
  const pipeline = rand(["PIPELINE_0", "PIPELINE_1"]);
  const MSGS = {
    error: [
      "Input loss detected: primary input failed",
      "Encoder error: resolution mismatch",
      "Output error: CDN origin unreachable",
      "Audio track desync detected",
    ],
    warn: [
      "Bitrate below target: 2.1 Mbps vs 5 Mbps",
      "Input redundancy switch triggered",
      "Buffer underflow: 2 frames dropped",
    ],
    info: [
      "Channel started successfully",
      "Input switch to backup completed",
      "Pipeline A running, Pipeline B standby",
    ],
  };
  const level = isErr ? "error" : Math.random() < 0.1 ? "warn" : "info";
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "medialive" },
    },
    aws: {
      dimensions: { ChannelId: channelId, Pipeline: pipeline },
      medialive: {
        channel_id: channelId,
        channel_name: channel,
        channel_state: isErr ? "ERROR" : rand(["RUNNING", "RUNNING", "IDLE"]),
        pipeline,
        input_type: rand(["RTMP_PUSH", "RTP_PUSH", "UDP_PUSH", "MEDIACONNECT"]),
        output_type: rand(["HLS", "DASH", "RTMP", "MEDIAPACKAGE"]),
        video_bitrate_kbps: isErr ? randInt(500, 2000) : randInt(3000, 15000),
        input_loss_frames: isErr ? randInt(1, 1000) : 0,
        encoder_fps: isErr ? randInt(5, 24) : rand([24, 25, 29.97, 30, 60]),
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.medialive",
      provider: "medialive.amazonaws.com",
      duration: randInt(1000, isErr ? 30000 : 10000) * 1e6,
    },
    message: JSON.stringify({
      level,
      log: rand(MSGS[level]),
      timestamp: new Date(ts).toISOString(),
      ...(isErr ? { status: "Failed" } : { status: "Succeeded" }),
    }),
    log: { level },
    ...(level === "error"
      ? {
          error: {
            code: rand([
              "ConflictException",
              "BadGatewayException",
              "ServiceUnavailableException",
              "ThrottlingException",
            ]),
            message: rand(MSGS.error),
            type: "aws",
          },
        }
      : {}),
  };
}

function generateManagedBlockchainLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const network = rand(["Hyperledger Fabric", "Ethereum"]);
  const networkId = `n-${randId(26)}`;
  const event = rand([
    "ProposalCreated",
    "VoteCompleted",
    "MemberCreated",
    "NodeCreated",
    "TransactionSubmitted",
    "ChaincodeDefined",
    "ChannelCreated",
  ]);
  const txId = randId(64).toLowerCase();
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "managedblockchain" },
    },
    aws: {
      managedblockchain: {
        network_id: networkId,
        network_name: rand(["supply-chain-net", "financial-consortium", "logistics-network"]),
        framework: network,
        framework_version: network === "Hyperledger Fabric" ? rand(["2.2", "2.4"]) : "Ethereum",
        member_id: `m-${randId(26)}`,
        member_name: rand(["Company-A", "Company-B", "Auditor", "Bank-1"]),
        node_id: `nd-${randId(26)}`,
        event_type: event,
        transaction_id: event.includes("Transaction") ? txId : null,
        proposal_id: event.includes("Proposal") || event.includes("Vote") ? randId(26) : null,
        channel_name:
          network === "Hyperledger Fabric"
            ? rand(["mychannel", "supply-channel", "audit-channel"])
            : null,
        chaincode_id: event.includes("Chaincode")
          ? rand(["asset-transfer", "token-contract", "escrow"])
          : null,
        status: isErr ? "FAILED" : "SUCCEEDED",
        error_code: isErr
          ? rand(["ResourceNotFoundException", "ThrottlingException", "IllegalActionException"])
          : null,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process", "database"],
      dataset: "aws.blockchain",
      provider: "managedblockchain.amazonaws.com",
      duration: randInt(500, isErr ? 30000 : 5000) * 1e6,
    },
    message: JSON.stringify({
      timestamp: new Date(ts).toISOString(),
      ...(isErr ? { status: "Failed" } : { status: "Succeeded" }),
    }),
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand([
              "ResourceNotFoundException",
              "ThrottlingException",
              "IllegalActionException",
            ]),
            message: "Managed Blockchain operation failed",
            type: "aws",
          },
        }
      : {}),
  };
}

function generateResilienceHubLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const app = rand([
    "ecommerce-platform",
    "payment-gateway",
    "data-pipeline",
    "customer-portal",
    "inventory-service",
  ]);
  const action = rand([
    "RunResiliencyAssessment",
    "PublishRecommendations",
    "ImportResourcesToDraft",
    "DeleteResiliencyPolicy",
    "CreateApp",
    "CreateRecommendationTemplate",
  ]);
  const rto = randInt(60, 3600);
  const rpo = randInt(60, 3600);
  const resiliencyScore = isErr ? randInt(0, 50) : randInt(60, 100);
  const tier = rand(["Critical", "Core", "Non-Critical", "Important"]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "resiliencehub" },
    },
    aws: {
      resiliencehub: {
        app_arn: `arn:aws:resiliencehub:${region}:${acct.id}:app/${randId(36).toLowerCase()}`,
        app_name: app,
        operation: action,
        resiliency_score: resiliencyScore,
        compliance_status: isErr ? "POLICY_BREACHED" : "POLICY_MET",
        current_rto_seconds: rto,
        target_rto_seconds: isErr ? Math.floor(rto * 0.5) : rto * 2,
        current_rpo_seconds: rpo,
        target_rpo_seconds: isErr ? Math.floor(rpo * 0.5) : rpo * 2,
        tier,
        disruption_type: rand(["AZ", "Hardware", "Software", "Region", "all"]),
        recommendation_count: randInt(0, 20),
        error_code: isErr
          ? rand(["ResourceNotFoundException", "ValidationException", "ThrottlingException"])
          : null,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process", "configuration"],
      dataset: "aws.resiliencehub",
      provider: "resiliencehub.amazonaws.com",
      duration: randInt(30, isErr ? 600 : 180) * 1e9,
    },
    message: JSON.stringify({
      timestamp: new Date(ts).toISOString(),
      ...(isErr ? { status: "Failed" } : { status: "Succeeded" }),
    }),
    log: { level: isErr ? "warn" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand(["ResourceNotFoundException", "ValidationException", "ThrottlingException"]),
            message: "Resilience Hub policy breached",
            type: "aws",
          },
        }
      : {}),
  };
}

function generateRamLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const resourceType = rand([
    "ec2:Subnet",
    "ec2:TransitGateway",
    "ram:ResourceShare",
    "route53resolver:ResolverRule",
    "license-manager:LicenseConfiguration",
    "networkmanager:CoreNetwork",
  ]);
  const action = rand([
    "CreateResourceShare",
    "AssociateResourceShare",
    "GetResourceShareInvitations",
    "AcceptResourceShareInvitation",
    "DisassociateResourceShare",
    "RejectResourceShareInvitation",
  ]);
  const accountId = `${acct.id}`;
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "ram" },
    },
    aws: {
      ram: {
        resource_share_arn: `arn:aws:ram:${region}:${acct.id}:resource-share/${randId(36).toLowerCase()}`,
        resource_share_name: rand([
          "shared-subnets",
          "transit-gateway-share",
          "resolver-rules-share",
        ]),
        resource_type: resourceType,
        action,
        principal: accountId,
        allow_external_principals: rand([true, false]),
        status: isErr ? "FAILED" : rand(["ACTIVE", "PENDING"]),
        invitation_status: action.includes("Invitation")
          ? rand(["PENDING", "ACCEPTED", "REJECTED"])
          : null,
        error_code: isErr
          ? rand([
              "UnknownResourceException",
              "OperationNotPermittedException",
              "MissingRequiredParameterException",
            ])
          : null,
      },
    },
    event: {
      action,
      outcome: isErr ? "failure" : "success",
      category: ["configuration", "iam"],
      dataset: "aws.ram",
      provider: "ram.amazonaws.com",
      duration: randInt(50, isErr ? 3000 : 500) * 1e6,
    },
    message: JSON.stringify({
      timestamp: new Date(ts).toISOString(),
      ...(isErr ? { status: "Failed" } : { status: "Succeeded" }),
    }),
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand([
              "UnknownResourceException",
              "OperationNotPermittedException",
              "MissingRequiredParameterException",
            ]),
            message: "RAM operation failed",
            type: "aws",
          },
        }
      : {}),
  };
}

function generateMigrationHubLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const app = rand([
    "web-tier-migration",
    "database-rehost",
    "legacy-erp",
    "analytics-platform",
    "on-prem-k8s",
  ]);
  const status = isErr
    ? rand(["MIGRATION_FAILED", "NOT_STARTED"])
    : rand(["MIGRATION_IN_PROGRESS", "MIGRATION_COMPLETE", "MIGRATION_IN_PROGRESS"]);
  const server = `server-${randId(8).toLowerCase()}`;
  const tool = rand([
    "ApplicationMigrationService",
    "DatabaseMigrationService",
    "CloudEndure",
    "Carbonite",
    "ATADATA",
  ]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "migrationhub" },
    },
    aws: {
      migrationhub: {
        application_id: `app-${randId(17).toLowerCase()}`,
        application_name: app,
        server_id: `d-server-${randId(13)}`,
        server_name: server,
        migration_status: status,
        migration_tool: tool,
        progress_update_stream: rand(["DMS-stream", "SMS-stream", "MGN-stream"]),
        task: {
          status: isErr ? "FAILED" : "IN_PROGRESS",
          progress_percent: isErr ? randInt(10, 90) : randInt(50, 100),
          total_objects: randInt(10, 1000),
          replicated_objects: randInt(0, 1000),
        },
        error_code: isErr
          ? rand(["AccessDeniedException", "ResourceNotFoundException", "UnauthorizedOperation"])
          : null,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process", "configuration"],
      dataset: "aws.migrationhub",
      provider: "mgh.amazonaws.com",
      duration: randInt(3600, isErr ? 864000 : 86400) * 1e9,
    },
    message: JSON.stringify({
      timestamp: new Date(ts).toISOString(),
      ...(isErr ? { status: "Failed" } : { status: "Succeeded" }),
    }),
    log: { level: isErr ? "error" : status.includes("FAILED") ? "warn" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand([
              "AccessDeniedException",
              "ResourceNotFoundException",
              "ThrottlingException",
            ]),
            message: "Migration Hub task failed",
            type: "aws",
          },
        }
      : {}),
  };
}

function generateDevOpsGuruLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const svc = rand([
    "lambda-api",
    "rds-prod",
    "ecs-workers",
    "dynamodb-sessions",
    "sqs-orders",
    "elasticache-cache",
  ]);
  const insightType = rand(["PROACTIVE", "REACTIVE"]);
  const severity = rand(["HIGH", "MEDIUM", "LOW"]);
  const anomaly = rand([
    "Unusual increase in Lambda error rate",
    "RDS CPU spike correlated with API latency",
    "Memory utilization anomaly on ECS tasks",
    "DynamoDB throttling pattern detected",
    "SQS queue depth growing abnormally",
    "ElastiCache eviction rate spike",
  ]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "devopsguru" },
    },
    aws: {
      devopsguru: {
        insight_id: randId(36).toLowerCase(),
        insight_type: insightType,
        severity,
        resource_collection: {
          cloud_formation: { stack_names: [rand(["prod-stack", "api-stack", "data-stack"])] },
          tags: [{ key: "environment", value: "production" }],
        },
        anomaly_id: randId(36).toLowerCase(),
        anomaly_description: anomaly,
        anomaly_sources: [svc],
        start_time: new Date(Date.now() - randInt(0, 3600000)).toISOString(),
        end_time: isErr ? null : new Date().toISOString(),
        status: isErr ? "ONGOING" : "CLOSED",
        recommendation: rand([
          "Scale up resource",
          "Check recent deployments",
          "Review alarm thresholds",
          "Enable enhanced monitoring",
        ]),
        ssm_ops_items: isErr ? [`oi-${randId(8).toLowerCase()}`] : [],
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process", "configuration", "vulnerability"],
      dataset: "aws.devopsguru",
      provider: "devops-guru.amazonaws.com",
      duration: randInt(60, isErr ? 3600 : 900) * 1e9,
    },
    message: JSON.stringify({
      timestamp: new Date(ts).toISOString(),
      ...(isErr ? { status: "Failed" } : { status: "Succeeded" }),
    }),
    log: { level: isErr ? "error" : severity === "HIGH" ? "warn" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand(["ResourceNotFoundException", "ValidationException", "ThrottlingException"]),
            message: "DevOps Guru ongoing anomaly",
            type: "aws",
          },
        }
      : {}),
  };
}

function generateDeadlineCloudLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const farmId = `farm-${randId(16).toLowerCase()}`;
  const farmName = rand([
    "vfx-render-farm",
    "game-asset-farm",
    "animation-studio",
    "post-production",
    "ad-rendering",
  ]);
  const queueId = `queue-${randId(16).toLowerCase()}`;
  const queueName = rand(["high-priority", "standard", "batch-overnight", "test", "compositing"]);
  const jobId = `job-${randId(20).toLowerCase()}`;
  const jobName = rand([
    "shot_comp_0010",
    "lighting_pass_v3",
    "fx_simulation_hero",
    "motion_blur_final",
    "grade_master",
  ]);
  const taskId = `task-${randId(20).toLowerCase()}`;
  const taskStatus = isErr
    ? rand(["FAILED", "NOT_COMPATIBLE", "INTERRUPTED"])
    : rand(["SUCCEEDED", "RUNNING", "QUEUED", "ASSIGNED", "STARTING", "CANCELING"]);
  const jobStatus = isErr
    ? rand(["FAILED", "CANCELED"])
    : rand(["SUCCEEDED", "IN_PROGRESS", "QUEUED", "ARCHIVED"]);
  const action = rand([
    "CreateJob",
    "StartJob",
    "UpdateJob",
    "DeleteJob",
    "CreateWorker",
    "UpdateWorker",
    "AssignedSession",
    "GetTaskRunStatus",
    "CreateQueueEnvironment",
  ]);
  const workerHostName = `render-worker-${rand(["gpu-01", "gpu-02", "cpu-01", "cpu-02", "spot-01"])}.${region}.compute.internal`;
  const frameStart = randInt(1, 900);
  const frameEnd = frameStart + randInt(1, 100);
  const durationSec = randInt(1, isErr ? 7200 : 3600);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "deadlinecloud" },
    },
    aws: {
      dimensions: { FarmId: farmId, QueueId: queueId },
      deadlinecloud: {
        farm_id: farmId,
        farm_name: farmName,
        queue_id: queueId,
        queue_name: queueName,
        job_id: jobId,
        job_name: jobName,
        task_id: taskId,
        task_status: taskStatus,
        job_status: jobStatus,
        worker_hostname: workerHostName,
        frame_start: frameStart,
        frame_end: frameEnd,
        duration_seconds: durationSec,
        renderer: rand(["Arnold", "V-Ray", "RenderMan", "Redshift", "Cycles"]),
        priority: randInt(25, 75),
      },
    },
    event: {
      action,
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.deadlinecloud",
      provider: "deadline.amazonaws.com",
      duration: durationSec * 1e9,
    },
    message: JSON.stringify({
      timestamp: new Date(ts).toISOString(),
      ...(isErr ? { status: "Failed" } : { status: "Succeeded" }),
    }),
    log: { level: isErr ? "error" : taskStatus === "INTERRUPTED" ? "warn" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand([
              "ResourceNotFoundException",
              "AccessDeniedException",
              "ThrottlingException",
              "ValidationException",
            ]),
            message: "Deadline Cloud render task failed",
            type: "aws",
          },
        }
      : {}),
  };
}

function generateChimeSdkLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const voiceConnectorId = `abcdefgh${randId(12)}`;
  const callId = randUUID();
  const direction = rand(["Inbound", "Outbound"]);
  const callStatus = isErr
    ? rand(["Failed", "Busy", "NoAnswer", "Cancelled"])
    : rand(["Completed", "Completed", "Completed", "InProgress"]);
  const durationSeconds = isErr ? randInt(0, 30) : randInt(10, 3600);
  const packetLossPercent = isErr
    ? Number(randFloat(5, 30).toFixed(1))
    : Number(randFloat(0, 0.5).toFixed(2));
  const mosScore = isErr
    ? Number(randFloat(1, 2.5).toFixed(2))
    : Number(randFloat(3.5, 4.5).toFixed(2));
  const jitterMs = isErr ? randInt(50, 500) : randInt(1, 30);
  const sipResponseCode = isErr ? rand([486, 503, 408, 500]) : rand([200, 200, 200, 180, 183]);
  const action = rand([
    "VoiceConnectorConnected",
    "VoiceConnectorDisconnected",
    "CallAnswered",
    "CallCompleted",
    "CallFailed",
    "SIPTrunkRegistered",
  ]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "chimesdkvoice" },
    },
    aws: {
      dimensions: { VoiceConnectorId: voiceConnectorId, Direction: direction },
      chimesdkvoice: {
        voice_connector_id: voiceConnectorId,
        call_id: callId,
        direction,
        call_status: callStatus,
        from_number: `+1${randInt(2000000000, 9999999999)}`,
        to_number: `+1${randInt(2000000000, 9999999999)}`,
        duration_seconds: durationSeconds,
        packet_loss_percent: packetLossPercent,
        mos_score: mosScore,
        jitter_ms: jitterMs,
        sip_response_code: sipResponseCode,
      },
    },
    event: {
      action,
      outcome: isErr ? "failure" : "success",
      category: ["network", "session"],
      dataset: "aws.chimesdkvoice",
      provider: "chime.amazonaws.com",
    },
    message: JSON.stringify({
      timestamp: new Date(ts).toISOString(),
      ...(isErr ? { status: "Failed" } : { status: "Succeeded" }),
    }),
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand([
              "ServiceUnavailableException",
              "ThrottlingException",
              "BadRequestException",
            ]),
            message: "Chime SDK Voice call failed",
            type: "aws",
          },
        }
      : {}),
  };
}

function generateWorkMailLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const organizationId = `m-${randId(6).toLowerCase()}`;
  const mailboxId = `mailbox-${randId(10).toLowerCase()}`;
  const action = isErr
    ? rand(["EmailBounced", "EmailBounced"])
    : rand(["EmailDelivered", "Login", "Logout", "SendMail"]);
  const users = IAM_USERS;
  const fromUser = rand(users);
  const toUser = rand(users);
  const domain = "globex.io";
  const errorCode = rand(["EntityNotFoundException", "MailboxQuotaExceededException"]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "workmail" },
    },
    aws: {
      dimensions: { OrganizationId: organizationId },
      workmail: {
        organization_id: organizationId,
        mailbox_id: mailboxId,
        action,
        error_code: isErr ? errorCode : null,
      },
    },
    email: {
      from: { address: `${fromUser}@${domain}` },
      to: { address: `${toUser}@${domain}` },
    },
    event: {
      action,
      outcome: isErr ? "failure" : "success",
      category: ["email"],
      dataset: "aws.workmail",
      provider: "workmail.amazonaws.com",
      duration: randInt(10, 500) * 1e6,
    },
    data_stream: { type: "logs", dataset: "aws.workmail", namespace: "default" },
    message: JSON.stringify({
      timestamp: new Date(ts).toISOString(),
      ...(isErr ? { status: "Failed" } : { status: "Succeeded" }),
    }),
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: errorCode,
            message: `WorkMail email delivery failed in organization ${organizationId}`,
            type: "aws",
          },
        }
      : {}),
  };
}

function generateWickrLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const networkId = `wickr-${randId(8).toLowerCase()}`;
  const roomId = `room-${randId(8).toLowerCase()}`;
  const messageType = rand(["text", "file", "call"]);
  const retentionPolicy = rand(["30d", "90d", "365d", "7d"]);
  const userName = `${rand(FIRST_NAMES)}.${rand(LAST_NAMES)}`;
  const errorCode = rand(["ResourceNotFoundException", "ConflictException"]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "wickr" },
    },
    aws: {
      dimensions: { NetworkId: networkId, RoomId: roomId },
      wickr: {
        network_id: networkId,
        room_id: roomId,
        message_type: messageType,
        retention_policy: retentionPolicy,
        error_code: isErr ? errorCode : null,
      },
    },
    user: { name: userName },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["authentication"],
      dataset: "aws.wickr",
      provider: "wickr.amazonaws.com",
      duration: randInt(1, 200) * 1e6,
    },
    data_stream: { type: "logs", dataset: "aws.wickr", namespace: "default" },
    message: JSON.stringify({
      timestamp: new Date(ts).toISOString(),
      ...(isErr ? { status: "Failed" } : { status: "Succeeded" }),
    }),
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: errorCode,
            message: `Wickr compliance event in network ${networkId}`,
            type: "aws",
          },
        }
      : {}),
  };
}

export {
  generateWorkSpacesLog,
  generateConnectLog,
  generateAppStreamLog,
  generateGameLiftLog,
  generateSesLog,
  generatePinpointLog,
  generateTransferFamilyLog,
  generateLightsailLog,
  generateFraudDetectorLog,
  generateLocationServiceLog,
  generateMediaConvertLog,
  generateMediaLiveLog,
  generateManagedBlockchainLog,
  generateResilienceHubLog,
  generateRamLog,
  generateMigrationHubLog,
  generateDevOpsGuruLog,
  generateDeadlineCloudLog,
  generateChimeSdkLog,
  generateWorkMailLog,
  generateWickrLog,
};
