# Setup wizard and uninstall behavior

The **Setup** step in the web UI installs or removes Elastic assets (Fleet integrations, custom ingest pipelines, Kibana dashboards, ML jobs) for the cloud you chose on **Start** (AWS, GCP, or Azure). CLI equivalents live under `installer/` — see [installer/README.md](../installer/README.md).

---

## What the wizard can install

| Asset                   | Target APIs / notes                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------- |
| Official integration    | Kibana Fleet (`aws`, `gcp`, `azure`, optional APM)                                    |
| Custom ingest pipelines | Elasticsearch ingest pipeline API                                                     |
| Custom dashboards       | Kibana Dashboards API when available; otherwise saved-object import (e.g. Serverless) |
| ML anomaly jobs         | Elasticsearch ML APIs                                                                 |

---

## Selecting assets (pipelines, dashboards, ML)

You do **not** have to install everything.

- **Filter** — One search box narrows pipelines, dashboards, and ML groups together.
- **Per-pipeline choice** — Pipelines are grouped in accordions by pipeline `group` (e.g. analytics, compute). Expand a group and tick individual pipeline IDs, or use **All in group** / **None in group**. Human-readable headings use polish helpers (e.g. GCP **Data Warehouse** for the `datawarehouse` group slug).
- **Dashboards (AWS)** — When the app has loaded the AWS **Services** catalog, dashboard accordions use the **same category titles** as the Services step (_Networking & CDN_, _Developer & CI/CD_, _Storage & Databases_, etc.). Dashboards that cannot be mapped show under **Uncategorized**. Titles that need extra hints (e.g. combined **CI/CD** dashboards, **Augmented AI**, **App Recovery Controller**) are aligned via full-title matching. If the catalog is empty (edge case), grouping falls back to polished title fragments.
- **ML jobs**
  - **AWS** — Jobs are grouped in **one accordion per Services category** (merged across all ML JSON bundles, including jobs that ship in `new-services` and similar files). Use **All in group** / **None in group** per category. Matching uses job id, descriptions, and `event.dataset` / `aws.*` fields, with aliases where the dataset name differs from the catalog id (e.g. `aws.vpcflow` → VPC Flow under Networking).
  - **GCP / Azure** — Jobs stay grouped **per installer file** (each `*-jobs.json` group), with **All in file** / **None in file**.
- **Select visible / Clear visible** — Applies to whatever the filter currently shows (dashboards and ML groups included).
- **Align with Services step** — Uses the services you selected on the **Services** page (log/metrics services, or trace services when the app is in traces mode) to pre-select matching pipelines, dashboards, and ML jobs. Matching uses dataset IDs, pipeline naming (`logs-*.{suffix}-default`), dashboard titles (`AWS Lambda — …`, `GCP Alloydb — …`, etc.), and ML job metadata — it is **heuristic**. If nothing matches, adjust Services or pick assets manually.

The **Services** catalog (order and labels) for each cloud lives in `src/data/serviceGroups.ts` (AWS) and the corresponding `src/gcp/data/serviceGroups.ts` / `src/azure/data/serviceGroups.ts` files.

When you switch cloud vendor on **Start**, the Setup page **remounts** and selections reset to “all selected” for that cloud’s bundle so AWS/GCP/Azure lists do not get out of sync.

---

## Session persistence

- **Setup install/uninstall log** — If the app passes a persistence key (unified UI does), the Setup step log is stored in **sessionStorage** and survives a **tab refresh** in the same browsing session. It does not survive closing the tab/window in the same way as `localStorage`.
- **Ship activity log** — Same idea under a separate key per cloud.

---

## Uninstall mode

Turn on **Uninstall/Reinstall mode** to remove or reinstall selected assets. Pipeline and ML uninstall use Elasticsearch APIs. Integration uninstall uses Fleet. Dashboard uninstall uses Kibana saved-object delete APIs **when the deployment allows them**.

---

## Dashboard uninstall: Elastic Serverless and API limits

On some **Elastic Cloud Serverless** (and similar) Kibana deployments, HTTP routes exist for saved-object deletion but return **400 Bad Request** with a message such as:

> `uri [/api/saved_objects/dashboard/…]` or `uri [/api/saved_objects/_bulk_delete]` … **exists but is not available with the current configuration**

In that environment the load generator **cannot** remove dashboards programmatically. That is a **platform restriction**, not a bug in the tool.

**What to do:**

1. Remove dashboards in **Kibana** — e.g. **Management → Saved Objects** (filter by type `dashboard` and tag/title), or delete from the **Dashboards** app.
2. Or use a deployment type where Kibana exposes those APIs, if your Elastic subscription offers one.

The UI detects this case, **stops after the first failure**, and prints a short explanation instead of repeating one error per dashboard.

**CLI dashboard installers** (`npm run setup:aws-dashboards`, GCP/Azure equivalents) **install** only; they do not change this Serverless limitation for **delete**.

Pipelines and ML jobs are unaffected by this Kibana saved-object restriction (they use Elasticsearch APIs).

---

## Related documentation

- [installer/README.md](../installer/README.md) — CLI installers, credentials, pipeline groups
- [docs/development.md](./development.md) — Local dev, proxy, tests
- [README.md](../README.md) — Quick start, Docker, architecture overview
