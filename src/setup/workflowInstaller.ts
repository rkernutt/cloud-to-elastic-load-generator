/**
 * Kibana Workflow installer for the bundled
 * `data-pipeline-alert-enrichment.yaml` automation.
 *
 * Wraps the Workflows Management REST API (Stack 9.5+ shape — the older
 * `/api/workflows/_workflows` paths returned 404 from 9.5):
 *   GET    /api/workflows                        list (filter client-side by name)
 *   GET    /api/workflows/workflow/{id}          fetch single
 *   POST   /api/workflows                        bulk create — body { workflows: [...] }
 *   PUT    /api/workflows/workflow/{id}          update single
 *   DELETE /api/workflows/workflow/{id}          delete single
 *
 * The Workflows plugin is in technical preview from Stack 9.3 and requires an
 * Enterprise licence. Self-hosted clusters must also enable the UI via the
 * `workflows:ui:enabled` advanced setting. See docs/workflow-deployment.md.
 */
import { proxyCall, isKibanaFeatureUnavailable } from "./setupProxy";

/** Default workflow name from the bundled YAML — keep in sync with the asset. */
export const DEFAULT_WORKFLOW_NAME = "Data Pipeline Alert — CMDB Enrichment & Notification";

export interface WorkflowOverrides {
  /** Recipient address used by the `notify_email` step. */
  notifyTo?: string;
  /** Connector ID used by `notify_email` and the pre-flight guard step. */
  emailConnector?: string;
  /**
   * When true, swap the legacy `kibana.createCaseDefaultSpace` step for the
   * 9.4+ `cases.createCase` step block that ships as a comment in the YAML.
   * The wizard flips this on automatically when `detectKibanaMajorMinor`
   * resolves to ≥ 9.4 — pass `false` to keep the 9.3-compatible step.
   */
  use94CasesStep?: boolean;
}

/**
 * Apply user overrides to the bundled YAML. Returns a new string —
 * never mutates the input.
 *
 * We text-replace inside the YAML rather than parsing/serialising so the
 * comments, quoting, and ordering survive verbatim — the Workflows YAML
 * editor surfaces the file as-is, so layout matters to the user.
 */
export function applyWorkflowOverrides(yaml: string, overrides: WorkflowOverrides = {}): string {
  let out = yaml;

  if (overrides.notifyTo) {
    out = replaceInputDefault(out, "notifyTo", overrides.notifyTo);
  }

  if (overrides.emailConnector) {
    out = replaceInputDefault(out, "emailConnector", overrides.emailConnector);
  }

  if (overrides.use94CasesStep) {
    out = swap94CaseStep(out);
  }

  return out;
}

const LEGACY_CASE_STEP_START =
  "      - name: create_case\n        type: kibana.createCaseDefaultSpace\n";
// The legacy step's last line — used as the end marker so the swap does
// not depend on any neighbouring comment block. Keep in sync with the YAML.
const LEGACY_CASE_STEP_END = "            fields: null";

/**
 * Replace the legacy `kibana.createCaseDefaultSpace` step with the modern
 * 9.4+ `cases.createCase` step. We rebuild the step from scratch (rather
 * than uncommenting an inline alternative) so the YAML can stay lean — the
 * 9.4 recipe is documented in `docs/workflow-deployment.md`.
 */
function swap94CaseStep(yaml: string): string {
  const startIdx = yaml.indexOf(LEGACY_CASE_STEP_START);
  if (startIdx < 0) return yaml;

  const endMarker = yaml.indexOf(LEGACY_CASE_STEP_END, startIdx);
  if (endMarker < 0) return yaml;
  const altEndOfLine = yaml.indexOf("\n", endMarker);
  if (altEndOfLine < 0) return yaml;

  const replacement =
    "      - name: create_case\n" +
    "        type: cases.createCase\n" +
    "        with:\n" +
    '          owner: "observability"\n' +
    '          title: "Pipeline Alert Escalation: {{ event.alerts[0].kibana.alert.rule.name }}"\n' +
    "          description: |\n" +
    "            ## Alert Details\n" +
    "            **Rule:** {{ event.alerts[0].kibana.alert.rule.name }}\n" +
    "            **Message:** {{ event.alerts[0].message }}\n" +
    "\n" +
    "            ## Affected Infrastructure\n" +
    "            **CI:** {{ steps.lookup_affected_ci.output.hits.hits[0]._source.servicenow.event.name.value }}\n" +
    "            **Owner:** {{ steps.lookup_affected_ci.output.hits.hits[0]._source.servicenow.event.owned_by.display_value }}\n" +
    "            **Support Group:** {{ steps.lookup_affected_ci.output.hits.hits[0]._source.servicenow.event.support_group.display_value }}\n" +
    "\n" +
    "            ## Pipeline User\n" +
    "            **Triggered by:** {{ steps.find_pipeline_user.output.hits.hits[0]._source.user.name }}\n" +
    "            **Email:** {{ steps.lookup_servicenow_user.output.hits.hits[0]._source.servicenow.event.email.value }}\n" +
    "            **Phone:** {{ steps.lookup_servicenow_user.output.hits.hits[0]._source.servicenow.event.phone.value }}\n" +
    "\n" +
    "            ## Open Incidents ({{ steps.find_open_incidents.output.hits.total.value }})\n" +
    "            This CI has multiple open incidents. Escalating for review.\n" +
    '          severity: "high"\n' +
    "          tags: [data-pipeline, escalation, workflow-generated]\n" +
    "          settings:\n" +
    "            syncAlerts: false";

  // Strip any blank-line padding immediately after the alt block so the
  // section spacing stays consistent.
  let trailingNewlines = altEndOfLine + 1;
  while (yaml[trailingNewlines] === "\n") trailingNewlines++;

  return yaml.slice(0, startIdx) + replacement + "\n\n" + yaml.slice(trailingNewlines);
}

interface ListWorkflowsResponse {
  results?: Array<{ id?: string; name?: string }>;
  /** Some Workflows builds return `data` instead of `results`. */
  data?: Array<{ id?: string; name?: string }>;
}

interface BulkCreateWorkflowsResponse {
  /** 9.5+ bulk create response. */
  created?: Array<{ id?: string; name?: string }>;
  errors?: Array<{ name?: string; error?: string }>;
}

interface CreateWorkflowResponse {
  id?: string;
  /** Some endpoints wrap the created entity. */
  workflow?: { id?: string };
}

/** Locate an existing workflow by name. Returns its ID or null. */
export async function findWorkflowIdByName(
  kibanaUrl: string,
  apiKey: string,
  name: string
): Promise<string | null> {
  const kb = kibanaUrl.replace(/\/$/, "");
  // GET /api/workflows lists all workflows on this space; we filter by name client-side
  // so we don't depend on a server-side `?search=` that varies between Kibana versions.
  const raw = (await proxyCall({
    baseUrl: kb,
    apiKey,
    path: `/api/workflows`,
    method: "GET",
    allow404: true,
  })) as ListWorkflowsResponse | null;
  if (!raw) return null;
  const list = raw.results ?? raw.data ?? [];
  for (const entry of list) {
    if (typeof entry?.name === "string" && entry.name === name && typeof entry.id === "string") {
      return entry.id;
    }
  }
  return null;
}

/**
 * Detect the Kibana major.minor version from `/api/status` so the wizard can
 * default the 9.4 case-step toggle correctly. Returns null when status is
 * unavailable (not all Serverless deployments expose `version.number`).
 */
export async function detectKibanaMajorMinor(
  kibanaUrl: string,
  apiKey: string
): Promise<{ major: number; minor: number } | null> {
  try {
    const raw = (await proxyCall({
      baseUrl: kibanaUrl.replace(/\/$/, ""),
      apiKey,
      path: "/api/status",
      method: "GET",
      allow404: true,
    })) as { version?: { number?: string } | string } | null;
    const verRaw = raw && typeof raw === "object" ? (raw.version as { number?: string }) : null;
    const verStr = typeof verRaw === "string" ? verRaw : verRaw?.number;
    if (typeof verStr !== "string") return null;
    const m = verStr.match(/^(\d+)\.(\d+)/);
    if (!m) return null;
    return { major: parseInt(m[1], 10), minor: parseInt(m[2], 10) };
  } catch {
    return null;
  }
}

export interface InstallWorkflowResult {
  /** Workflow ID returned by Kibana (existing or newly created). */
  id: string;
  outcome: "created" | "updated" | "already_exists";
}

/**
 * Create or update the bundled workflow. Returns the workflow ID so callers
 * can hand it to {@link uninstallWorkflow} later.
 *
 * The Workflows API rejects unknown fields strictly, so we send the minimal
 * `{ name, description, yaml, enabled, tags }` envelope and let the server
 * derive everything else from the YAML body.
 */
export async function installWorkflow(opts: {
  kibanaUrl: string;
  apiKey: string;
  yaml: string;
  /** Overrides workflow name; defaults to whatever the YAML declares. */
  name?: string;
  description?: string;
  tags?: string[];
  /** When true, replace any pre-existing workflow with the same name. */
  overwrite?: boolean;
}): Promise<InstallWorkflowResult> {
  const { kibanaUrl, apiKey, yaml, overwrite = true } = opts;
  const kb = kibanaUrl.replace(/\/$/, "");

  const name = opts.name ?? extractYamlField(yaml, "name") ?? DEFAULT_WORKFLOW_NAME;
  const description = opts.description ?? extractYamlField(yaml, "description") ?? "";
  const tags = opts.tags ?? extractTagsFromYaml(yaml) ?? [];

  const existingId = await findWorkflowIdByName(kb, apiKey, name);

  if (existingId && !overwrite) {
    return { id: existingId, outcome: "already_exists" };
  }

  if (existingId && overwrite) {
    await proxyCall({
      baseUrl: kb,
      apiKey,
      path: `/api/workflows/workflow/${encodeURIComponent(existingId)}`,
      method: "PUT",
      body: { name, description, yaml, tags },
    });
    // Workflows on Kibana 9.5 silently ignore `enabled` when sent inside a
    // full PUT body alongside `yaml` (see elastic/kibana#252676). Follow up
    // with a partial PUT so the disabled state actually sticks. We always
    // install DISABLED — users must explicitly enable in Kibana after
    // reviewing the notification step and attaching the workflow to rules.
    await setWorkflowEnabled(kb, apiKey, existingId, false);
    return { id: existingId, outcome: "updated" };
  }

  // Stack 9.5+ uses a bulk create endpoint that wraps a single create:
  //   POST /api/workflows  { workflows: [{...}] }  →  { created: [{id, name, ...}] }
  // The previous singular `POST /api/workflows/_workflows` 404s on 9.5+, so we always
  // send the bulk shape — it is accepted on every version we ship to.
  const bulk = (await proxyCall({
    baseUrl: kb,
    apiKey,
    path: "/api/workflows",
    method: "POST",
    body: {
      // Install DISABLED — see note on the update branch above. Bulk create
      // honours the flag reliably; only the update path needs the follow-up
      // partial PUT to work around elastic/kibana#252676.
      workflows: [{ name, description, yaml, enabled: false, tags }],
    },
  })) as BulkCreateWorkflowsResponse | CreateWorkflowResponse | null;

  // Bulk shape ({ created: [...] }) takes precedence; fall back to the
  // legacy singular envelope so older clusters keep working too.
  const bulkCreated = (bulk as BulkCreateWorkflowsResponse | null)?.created;
  const id =
    (Array.isArray(bulkCreated) && bulkCreated[0]?.id) ||
    (bulk as CreateWorkflowResponse | null)?.id ||
    (bulk as CreateWorkflowResponse | null)?.workflow?.id;
  if (!id) {
    const errs = (bulk as BulkCreateWorkflowsResponse | null)?.errors;
    if (Array.isArray(errs) && errs.length > 0) {
      throw new Error(
        `Workflows API rejected create: ${errs[0]?.error ?? JSON.stringify(errs[0])}`
      );
    }
    throw new Error("Workflows API returned no id on create");
  }
  return { id, outcome: "created" };
}

/**
 * Toggle a workflow's `enabled` flag via a *partial* PUT. We do this in a
 * separate request from the YAML/tags update because Kibana 9.5 silently
 * drops the `enabled` field when it's bundled with `yaml` in a full PUT
 * body (see elastic/kibana#252676 — "Toggling workflow enabled state
 * corrupts YAML content"). The partial PUT path is unaffected and is the
 * only way to reliably flip the flag until the bug is fixed upstream.
 */
export async function setWorkflowEnabled(
  kibanaUrl: string,
  apiKey: string,
  workflowId: string,
  enabled: boolean
): Promise<void> {
  const kb = kibanaUrl.replace(/\/$/, "");
  await proxyCall({
    baseUrl: kb,
    apiKey,
    path: `/api/workflows/workflow/${encodeURIComponent(workflowId)}`,
    method: "PUT",
    body: { enabled },
  });
}

export type UninstallWorkflowOutcome = "deleted" | "not_found" | "api_disabled";

export async function uninstallWorkflow(opts: {
  kibanaUrl: string;
  apiKey: string;
  /** Either the explicit workflow ID returned by install, or the workflow name to look up. */
  id?: string;
  name?: string;
}): Promise<{ outcome: UninstallWorkflowOutcome; message?: string }> {
  const { kibanaUrl, apiKey } = opts;
  const kb = kibanaUrl.replace(/\/$/, "");

  let id = opts.id;
  if (!id && opts.name) {
    id = (await findWorkflowIdByName(kb, apiKey, opts.name)) ?? undefined;
  }
  if (!id) return { outcome: "not_found" };

  try {
    await proxyCall({
      baseUrl: kb,
      apiKey,
      path: `/api/workflows/workflow/${encodeURIComponent(id)}`,
      method: "DELETE",
      allow404: true,
    });
    return { outcome: "deleted" };
  } catch (e) {
    const msg = String(e);
    if (isKibanaFeatureUnavailable(msg)) {
      return { outcome: "api_disabled", message: msg };
    }
    throw e;
  }
}

/**
 * Replace the `default:` value for a specific input list entry.
 * The bundled YAML lays inputs out as:
 *   - name: emailConnector
 *     type: string
 *     required: true
 *     default: "elastic-cloud-email"
 * We scope the replacement to the block beginning with `- name: <key>` so
 * we never accidentally rewrite a different input's default.
 */
function replaceInputDefault(yaml: string, inputName: string, value: string): string {
  const escaped = inputName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `(^\\s*-\\s+name:\\s*${escaped}\\s*\\n(?:\\s+\\S.*\\n)*?\\s+default:\\s*)["']?[^"'\\n]+["']?`,
    "m"
  );
  return yaml.replace(re, `$1"${value.replace(/"/g, '\\"')}"`);
}

/** Best-effort extraction of a top-level YAML scalar (`name`, `description`). */
function extractYamlField(yaml: string, field: string): string | null {
  const re = new RegExp(`^${field}:\\s*(?:>\\s*\\n((?:\\s+\\S.*\\n?)+)|(.+))$`, "m");
  const m = yaml.match(re);
  if (!m) return null;
  if (m[1]) {
    return m[1]
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .join(" ");
  }
  return m[2]?.trim().replace(/^["']|["']$/g, "") ?? null;
}

/** Best-effort extraction of the top-level `tags:` block (list of strings). */
function extractTagsFromYaml(yaml: string): string[] | null {
  const m = yaml.match(/^tags:\s*\n((?:\s+-\s+\S.*\n?)+)/m);
  if (!m) return null;
  return m[1]
    .split("\n")
    .map((l) => l.replace(/^\s+-\s+/, "").trim())
    .filter(Boolean);
}
