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
