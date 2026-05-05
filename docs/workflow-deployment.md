# Workflow deployment guide

The bundled [`data-pipeline-alert-enrichment.yaml`](../workflows/data-pipeline-alert-enrichment.yaml) is a Kibana **Workflow** that runs when any data-pipeline alerting rule fires. It enriches the alert with ServiceNow CMDB context (CI owner, support group, open incidents, recent changes), opens a Kibana case when multiple incidents are found, emails the on-call group, and indexes the enriched record back to Elasticsearch.

This page documents how to install and run it on each Elastic deployment type.

## Deployment compatibility

| Deployment                                            | Workflows plugin | `elastic-cloud-email` connector                                        | Out-of-the-box?                |
| ----------------------------------------------------- | ---------------- | ---------------------------------------------------------------------- | ------------------------------ |
| **Elastic Cloud Hosted (ESS)**                        | GA               | Auto-provisioned                                                       | Yes                            |
| **Elastic Cloud Serverless** (Observability/Security) | Preview          | Auto-provisioned (id `elastic-cloud-email`, name `Elastic-Cloud-SMTP`) | Yes                            |
| **Self-hosted** (Stack 9.3+, ECE, ECK)                | Preview from 9.3 | Not provisioned                                                        | Requires extra connector setup |

### Required licences

| Feature                                 | Licence                                                                      |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| Workflows plugin                        | **Enterprise**                                                               |
| Cases (`kibana.createCaseDefaultSpace`) | **Platinum** or higher (included in Observability / Security solution tiers) |
| Email / Slack / Teams / etc. connectors | All Stack tiers; specific webhook actions may require Gold+                  |

On Elastic Cloud Hosted and Serverless these tiers are bundled by default for projects with the Observability or Security solution. On self-hosted, your subscription must include them.

### Kibana sizing

Workflows is memory-hungry — Elastic raised the default Kibana instance size on Elastic Cloud Hosted to **2 GB RAM** in 9.4 specifically because Workflows, Reporting, Detection Rules and Agent Builder can cause service interruptions on smaller instances. We recommend the same minimum on self-hosted, ECE and ECK clusters that run this workflow.

### Enabling Workflows on self-hosted

Workflows is preview on self-hosted from 9.3 and is **off by default**. Enable it through:

```
Stack Management → Advanced Settings → workflows:ui:enabled = true
```

Equivalent API call:

```bash
curl -sS -X POST "$KIBANA_URL/api/kibana/settings" \
  -H "Authorization: ApiKey $API_KEY" \
  -H "kbn-xsrf: true" \
  -H "Content-Type: application/json" \
  -d '{"changes":{"workflows:ui:enabled":true}}'
```

## Inputs

The workflow exposes three inputs you can override at install time. Defaults are picked so the workflow runs unchanged on Elastic Cloud Hosted and Serverless.

| Input            | Default                            | Used by                                              |
| ---------------- | ---------------------------------- | ---------------------------------------------------- |
| `emailConnector` | `elastic-cloud-email`              | The active `notify_email` step                       |
| `notifyTo`       | `data-platform-oncall@example.com` | Recipient of `notify_email`                          |
| `slackConnector` | `data-pipeline-alerts`             | Optional — only used if you uncomment `notify_slack` |

## Three install paths

You can deploy this workflow whichever way fits your flow:

| Path                 | When to use                                                                | How                                                                                                                                                                                                                                                                                                |
| -------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Setup wizard**     | Day-to-day, you already use the Setup page                                 | Tick **Alert-enrichment Workflow** in the Setup wizard, optionally override `emailConnector` / `notifyTo`, and click Install. The wizard auto-detects 9.4+ and substitutes the new `cases.createCase` step. Uninstall and Reinstall handle it the same way.                                        |
| **CLI installer**    | Headless / CI installs, no browser, scripted promotions between spaces     | `npm run setup:workflow` (or `node installer/workflow-installer/index.mjs`). Interactive prompts mirror the wizard. Same overrides, same idempotent create-or-update behaviour. See [installer/workflow-installer/README.md](../installer/workflow-installer/README.md).                           |
| **Manual paste**     | Workflows REST API blocked on your tier, or you simply prefer the UI       | Open `workflows/data-pipeline-alert-enrichment.yaml` (mirror at `assets/workflows/data-pipeline-alert-enrichment.yaml`), copy the contents, paste into **Stack Management → Workflows → Create**, edit the input defaults at the top of the file as needed, save.                                  |

All three paths produce the same workflow — you can mix and match (e.g. install via the wizard, then later edit the YAML in Stack Management). The wizard's pre-flight email-connector check fires before the install POST runs, so a misconfigured connector ID is reported immediately.

## Setup per deployment type

### Elastic Cloud Hosted

1. Confirm the Workflows app is visible under the navigation. (Cloud Hosted enables it automatically on supported tiers.)
2. Tick **Alert-enrichment Workflow** in the Setup wizard, override `notifyTo` if you want a different recipient, click Install. (Or use one of the other install paths above.)
3. Done. The workflow will fire on the next data-pipeline alert.

### Elastic Cloud Serverless

1. Workflows is a preview feature — confirm your project type (Observability or Security) shows the Workflows app.
2. Same install path as Cloud Hosted. The `elastic-cloud-email` connector ID resolves automatically.

### Self-hosted (Stack 9.3+, ECE, ECK)

The default `elastic-cloud-email` connector does **not** exist on self-hosted deployments — Elastic's control plane provisions it only on Cloud-managed clusters. You have two options:

#### Option A — Preconfigure in `kibana.yml` (recommended)

Add an entry that uses the same `elastic-cloud-email` ID so the workflow runs unchanged:

```yaml
xpack.actions.preconfigured:
  elastic-cloud-email:
    name: SMTP
    actionTypeId: .email
    config:
      service: other
      from: alerts@example.com
      host: smtp.example.com
      port: 587
      hasAuth: true
    secrets:
      user: smtp-user
      password: smtp-password
```

Restart Kibana, install the workflow, override `notifyTo` if desired.

#### Option B — Bring your own connector ID

1. Create an email connector via **Stack Management → Connectors** (or the Actions API). Note its connector ID.
2. When installing the workflow, set the `emailConnector` input to that ID:
   - **Wizard:** type the ID into the "Email connector ID" field on the Alert-enrichment Workflow row.
   - **CLI:** answer "y" at the override prompt and supply the ID.
   - **Manual paste:** edit the `emailConnector.default` value at the top of the YAML before saving.
3. Save. The workflow now points at your connector.

## Switching to a different channel

The workflow ships with six commented-out alternatives directly below the active `notify_email` step:

- `notify_slack` (Slack — `.slack` or `.slack_api`)
- `notify_teams` (Microsoft Teams incoming webhook)
- `notify_pagerduty` (PagerDuty)
- `notify_servicenow` (ServiceNow ITSM — creates an incident)
- `notify_opsgenie` (Opsgenie)
- `notify_webhook` (generic webhook)

Each block reuses the same enriched-alert template. To switch channels, comment out the email step and uncomment one (or several) alternatives. They run sequentially; wrap them in a `parallel` step if you need concurrent fan-out. Each requires a connector you've already configured under **Kibana → Stack Management → Connectors**.

## Pre-flight connector validation

The first step the workflow runs is `validate_email_connector`, a `kibana.request` step that GETs `/api/actions/connector/{{ inputs.emailConnector }}`. If the connector ID resolves, the workflow continues; if it doesn't, the run aborts immediately with a single clear error rather than silently burning retries inside `notify_email`.

Common outcomes:

- **200 OK** — connector exists; workflow continues to alert handling.
- **404 Not Found** — connector ID is wrong or the connector hasn't been created on this deployment. Run history will surface the failed step as the abort cause. Fix:
  - Cloud Hosted / Serverless: confirm `elastic-cloud-email` exists under **Stack Management → Connectors** (it should be auto-provisioned).
  - Self-hosted: apply Option A or Option B above.
- **403 Forbidden** — the workflow's runtime token lacks `read` on the action. Grant Kibana **Actions and Connectors** read privileges to the workflow's role.

## Stack 9.4+ enhancements

These are optional ergonomic improvements you can adopt once the cluster is on 9.4. The workflow runs unchanged on 9.3 — none of these are required.

| Feature                                                                                                                                            | What it gives you                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **First-class cases steps** — `cases.createCase`, `cases.updateCase`, `cases.getCase`, `cases.addComment`                                          | Drop-in replacement for the `kibana.createCaseDefaultSpace` step in section 7. No more required `connector` / `settings` block, and an opt-in `push-case: true` flag automatically pushes the case to an attached Jira / ServiceNow ITSM connector. The bundled YAML keeps the legacy step for 9.3 compatibility but ships the 9.4 alternative as a commented block immediately below it. |
| **`workflows.executionFailed` trigger**                                                                                                            | Lets you create a sister workflow that fires whenever this one fails. Handy for fallback notifications (e.g. SMS / pager) when the primary email channel is degraded.                                                                                   |
| **Server-side workflow validation endpoint** (`POST /api/workflows/_workflows/_validate`)                                                          | Gate this YAML in CI before deploy so a typo never reaches a running cluster. Pair with the workflow's import / export endpoints below for full GitOps.                                                                                                  |
| **Workflow import / export from the UI**                                                                                                           | Promote workflows between spaces (or between Cloud → Serverless) without copy-pasting YAML. Useful for staging → production rollouts.                                                                                                                    |
| **Streams API steps**                                                                                                                              | Reach Streams resources directly without going through `kibana.request`. Not required by this workflow today, but worth knowing if you extend it.                                                                                                        |

## Triggering the workflow

The workflow's trigger is `type: alert`, which means it fires whenever a Kibana **alerting rule** sends it the alert payload. The bundled data-pipeline alerting rules (installed by the Setup wizard or `npm run setup:alert-rules`) are pre-wired to send their payload to this workflow when one is registered. If you install the workflow before installing the alerting rules, no extra wiring is needed.

You can also test the workflow manually:

```bash
curl -sS -X POST "$KIBANA_URL/api/workflows/_workflows/<workflow-id>/run" \
  -H "Authorization: ApiKey $API_KEY" \
  -H "kbn-xsrf: true" \
  -H "Content-Type: application/json" \
  -d '{"event":{"alerts":[{"kibana":{"alert":{"rule":{"name":"[CloudLoadGen] Pipeline Failure"}}}, "message":"Manual test"}]}}'
```

## Troubleshooting

| Symptom                                                                                         | Likely cause                                                                               | Fix                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workflow runs succeed but no email arrives                                                      | Self-hosted with no preconfigured `elastic-cloud-email` connector                          | Apply Option A or Option B above                                                                                                                                                                           |
| Workflow aborts on `validate_email_connector` with 404                                          | `inputs.emailConnector` doesn't match any connector on this deployment                     | Check **Stack Management → Connectors** for the connector ID; pass the correct ID via `inputs.emailConnector` (self-hosted: see Option A / Option B above)                                                 |
| Notify step errors with `connector not found` (older workflow version, no pre-flight)           | The `emailConnector` / `slackConnector` input value doesn't match any connector            | Same as above; the pre-flight step in the current YAML normally catches this before `notify_email` runs                                                                                                    |
| `lookup_affected_ci` returns 0 hits                                                             | ServiceNow CMDB data not shipped, or shipped before the cross-cloud enrichment fix         | Re-ship CMDB data with a current build of Cloud Loadgen for Elastic; verify `event.module` of CMDB docs is `servicenow` (not `aws`/`gcp`/`azure`) — see [advanced-data-types.md](./advanced-data-types.md) |
| `find_pipeline_user` / `find_open_incidents` fail with sort validation                          | Workflows v1.0.0 strict-schema rejects the named `elasticsearch.search` action's sort body | The bundled YAML already routes those steps through `elasticsearch.request`; if you customised them, mirror that pattern. On 9.4+ you can also pre-validate the YAML via `POST /api/workflows/_workflows/_validate` before saving |
| `open_case` errors with `Invalid option: expected "cases"\|"observability"\|"securitySolution"` | The Cases plugin is bound to a fixed set of owners; the workflow uses `observability`      | Keep `owner: "observability"` (or set to `cases` / `securitySolution` to match your space)                                                                                                                 |
| Notification fires but enriched fields are blank                                                | The CMDB lookup ran but didn't match any CI                                                | Make sure the data-pipeline chain and CMDB were shipped under the same labelling (`DATA_ENGINEERING_USERS`, `mwaa-globex-prod`, `emr-analytics-cluster`, …)                                                |

## Related

- [advanced-data-types.md](./advanced-data-types.md) — overview of the chained scenarios, CSPM/KSPM, ServiceNow CMDB, and how they relate to this workflow
- [SETUP-WIZARD-AND-UNINSTALL.md](./SETUP-WIZARD-AND-UNINSTALL.md) — installing the alerting rules + dashboards the workflow consumes
- Elastic docs — [Workflows](https://www.elastic.co/docs/explore-analyze/workflows) · [External system steps](https://www.elastic.co/docs/explore-analyze/workflows/steps/external-systems-apps) · [Preconfigured connectors](https://www.elastic.co/docs/reference/kibana/connectors-kibana/pre-configured-connectors)
