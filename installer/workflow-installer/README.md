# Alert-Enrichment Workflow Installer

Headless / CI-friendly installer for the bundled
[`workflows/data-pipeline-alert-enrichment.yaml`](../../workflows/data-pipeline-alert-enrichment.yaml)
Kibana Workflow.

Run from the repo root:

```bash
npm run setup:workflow
# or directly
node installer/workflow-installer/index.mjs
```

The installer is interactive — it prompts for the deployment type, Kibana URL,
API key, and an action (install / delete / reinstall). It mirrors the wizard's
in-browser behaviour so the wizard and the CLI stay in sync:

- Pre-flights `/api/actions/connector/{emailConnector}` and warns (without
  blocking) if the connector is missing.
- Auto-detects Kibana 9.4+ from `/api/status` and substitutes the legacy
  `kibana.createCaseDefaultSpace` step for the new `cases.createCase` step.
- Lets you override the workflow's `notifyTo` and `emailConnector` inputs at
  install time.
- Idempotent — repeated runs replace the existing workflow rather than
  duplicating it.

## What this installer does NOT do

- It does **not** attach the workflow to any alerting rule. Every
  Cloud Loadgen alerting rule ships with `"actions": []` and the installer
  never modifies rules. After install, attach the workflow per rule under
  **Stack Management → Rules → \<rule\> → Actions → Workflow**.
- It does **not** lock you into the email channel. The default
  `notify_email` step is the simplest path on Cloud Hosted / Serverless,
  but the YAML ships Slack / Teams / PagerDuty / ServiceNow ITSM /
  Opsgenie / generic-webhook variants as commented blocks. Comment out
  the email step and uncomment one (or several) of those before installing
  if you want a different channel — the installer prompts let you set the
  email connector ID so you can also point the email step at any custom
  SMTP connector you configured yourself.

## Requirements

| Deployment                 | Workflows plugin     | Notes                                                                                                              |
| -------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Elastic Cloud Hosted (ESS) | GA                   | `elastic-cloud-email` is auto-provisioned                                                                          |
| Elastic Cloud Serverless   | Preview              | Same `elastic-cloud-email` ID is preconfigured                                                                     |
| Self-hosted (Stack 9.3+)   | Preview from 9.3     | Set `workflows:ui:enabled = true` in Advanced Settings or `kibana.yml`. Preconfigure `elastic-cloud-email` or pass a different connector ID at the installer prompt. Enterprise licence required. |

## API key permissions

Grant the API key:

- Kibana → Management → Workflows → All
- Kibana → Actions and Connectors → Read

## Manual fallback

If the Workflows API is blocked on your deployment, paste the YAML directly
into Stack Management → Workflows → Create. The asset is mirrored to
`assets/workflows/data-pipeline-alert-enrichment.yaml` for that purpose.

See [docs/workflow-deployment.md](../../docs/workflow-deployment.md) for the
full deployment guide and troubleshooting matrix.
