# API Key Permissions (Least Privilege)

The load generator needs an Elasticsearch API key to ship data and (optionally) install assets. This guide provides two scoped key definitions — **ship-only** and **full-access** — so you grant only the privileges each workflow requires.

Both key definitions live in `installer/api-keys/` as ready-to-use JSON bodies for the Elasticsearch [Create API Key](https://www.elastic.co/docs/api/doc/elasticsearch/operation/operation-security-create-api-key) endpoint.

---

## Quick reference

| Key             | File                                                                            | Use case                                                                                                       |
| --------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Ship-only**   | [`installer/api-keys/ship-only.json`](../installer/api-keys/ship-only.json)     | Bulk indexing logs, metrics, and traces — no dashboard/ML/rule management                                      |
| **Full-access** | [`installer/api-keys/full-access.json`](../installer/api-keys/full-access.json) | Ship data **plus** install/uninstall dashboards, ML jobs, alerting rules, ingest pipelines, Fleet integrations |

---

## Creating the key

### Dev Tools (Kibana)

Paste the contents of either JSON file into **Dev Tools** as a `POST /_security/api_key` request:

```
POST /_security/api_key
{
  ... contents of ship-only.json or full-access.json ...
}
```

The response returns an `id` and `api_key`. Combine them as `<id>:<api_key>` and Base64-encode the result for the `Authorization: ApiKey <encoded>` header, or paste the encoded value directly into the load generator's **API Key** field.

### cURL

```bash
# Ship-only key
curl -s -X POST "${ES_URL}/_security/api_key" \
  -H "Content-Type: application/json" \
  -H "Authorization: ApiKey ${ADMIN_KEY}" \
  -d @installer/api-keys/ship-only.json | jq .

# Full-access key
curl -s -X POST "${ES_URL}/_security/api_key" \
  -H "Content-Type: application/json" \
  -H "Authorization: ApiKey ${ADMIN_KEY}" \
  -d @installer/api-keys/full-access.json | jq .
```

> The creating user (or key) must itself hold every privilege being delegated. On Elastic Cloud the default admin user or a `superuser` key works.

---

## Metadata and tagging

Both key definitions include a `metadata` block:

```json
{
  "metadata": {
    "application": "cloud-to-elastic-load-generator",
    "tags": ["cloudloadgen"],
    "purpose": "..."
  }
}
```

This mirrors the `cloudloadgen` tag used on all installed assets (dashboards, ML jobs, pipelines, alerting rules). You can filter API keys in Kibana **Stack Management → API Keys** by searching for `cloudloadgen` to find keys created for this tool alongside the assets they manage.

---

## Ship-only key — privilege breakdown

This key can bulk-index documents but cannot create or modify any Elastic assets.

### Cluster privileges

| Privilege | Why                                                  |
| --------- | ---------------------------------------------------- |
| `monitor` | `GET /` — connection test that reads cluster version |

### Index privileges

| Index pattern                                       | Privileges                                                            | Why                             |
| --------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------- |
| `logs-aws.*`, `logs-gcp.*`, `logs-azure.*`          | `auto_configure`, `create_doc`, `create_index`, `view_index_metadata` | Write log documents via `_bulk` |
| `logs-cloud_security_posture.findings*`             | same                                                                  | CSPM / KSPM findings            |
| `logs-servicenow.event-*`                           | same                                                                  | ServiceNow CMDB records         |
| `metrics-aws.*`, `metrics-gcp.*`, `metrics-azure.*` | same                                                                  | Write metric documents          |
| `metrics-o365_metrics.*`                            | same                                                                  | Azure M365 / Office 365 metrics |
| `traces-apm*`, `traces-aws.*`                       | same                                                                  | APM traces and AWS X-Ray traces |

> `auto_configure` lets data streams auto-create with the correct mappings. `create_doc` permits only document creation (no update/delete). `create_index` is needed if the backing index does not yet exist. `view_index_metadata` supports the connection test and pre-flight checks.

---

## Full-access key — privilege breakdown

Inherits all ship-only privileges and adds asset management.

### Additional cluster privileges

| Privilege                 | Why                                                                             |
| ------------------------- | ------------------------------------------------------------------------------- |
| `manage_ml`               | Create, open, start, stop, close, and delete ML anomaly detectors and datafeeds |
| `manage_ingest_pipelines` | Create, update, and delete ingest pipelines                                     |
| `manage_index_templates`  | Create component templates and index templates (TSDS metrics)                   |

### Additional index privileges

| Index pattern                | Privileges                    | Why                                                                              |
| ---------------------------- | ----------------------------- | -------------------------------------------------------------------------------- |
| (same patterns as ship-only) | `read`, `view_index_metadata` | ML datafeeds read from these indices; pipeline installation verifies index state |

### Kibana application privileges

These grant access to Kibana features via the `kibana-.kibana` application scope. The `space:*` resource means all Kibana spaces.

| Privilege                            | Why                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------ |
| `feature_dashboard.all`              | Create, update, and delete Kibana dashboards                                         |
| `feature_savedObjectsManagement.all` | Import dashboards via saved-object NDJSON import; manage saved objects               |
| `feature_savedObjectsTagging.all`    | Create and assign the `cloudloadgen` tag to dashboards                               |
| `feature_stackAlerts.all`            | Create, enable, disable, and delete Elasticsearch-query alerting rules               |
| `feature_fleet.all`                  | Install and remove Fleet integrations (AWS, GCP, Azure, APM, cloud_security_posture) |
| `feature_ml.all`                     | View ML jobs in Kibana UI (Elasticsearch-side `manage_ml` handles the API calls)     |
| `feature_indexPatterns.all`          | Create data views used by dashboard panels                                           |

---

## Choosing the right key

| Scenario                                                    | Key                                    |
| ----------------------------------------------------------- | -------------------------------------- |
| CI pipeline that only ships data (assets already installed) | **ship-only**                          |
| Demo or POC where you set up everything from scratch        | **full-access**                        |
| Production environment with pre-installed assets            | **ship-only**                          |
| One-off asset installation via CLI installers               | **full-access** (revoke after install) |

For maximum security, create a **full-access** key for initial setup, install all assets, then revoke it and switch to a **ship-only** key for ongoing data generation.

---

## Revoking keys

```
DELETE /_security/api_key
{
  "name": "cloudloadgen-ship"
}
```

Or revoke by ID:

```
DELETE /_security/api_key
{
  "ids": ["<api_key_id>"]
}
```

You can also revoke from **Stack Management → API Keys** in Kibana.

---

## Elastic Cloud Serverless

Serverless projects use project-scoped API keys created from the Elastic Cloud console. The privileges above map to equivalent Serverless roles — use the **Admin** preset for full-access or the **Developer** preset for ship-only. Serverless does not support custom `role_descriptors` on API keys; role assignment is handled at the project level.

---

## API operations reference

The complete list of Elasticsearch and Kibana API operations the tool performs, grouped by privilege requirement:

### Ship (Elasticsearch)

- `GET /` — cluster info and connection test
- `POST /_bulk` — index logs, metrics, and traces

### Setup — Elasticsearch

- `PUT /_ingest/pipeline/{id}` — create/update ingest pipelines
- `DELETE /_ingest/pipeline/{id}` — remove ingest pipelines
- `PUT /_component_template/{id}` — TSDS component templates
- `PUT /_index_template/{id}` — TSDS index templates
- `GET /_ml/info` — check ML availability
- `PUT /_ml/anomaly_detectors/{id}` — create ML jobs
- `GET /_ml/anomaly_detectors/{id}` — check if job exists
- `DELETE /_ml/anomaly_detectors/{id}` — remove ML jobs
- `POST /_ml/anomaly_detectors/{id}/_open` — open ML jobs
- `POST /_ml/anomaly_detectors/{id}/_close` — close ML jobs
- `PUT /_ml/datafeeds/datafeed-{id}` — create datafeeds
- `POST /_ml/datafeeds/datafeed-{id}/_start` — start datafeeds
- `POST /_ml/datafeeds/datafeed-{id}/_stop` — stop datafeeds
- `DELETE /_ml/datafeeds/datafeed-{id}` — remove datafeeds
- `GET /_data_stream/traces-apm-default` — verify APM data stream

### Setup — Kibana

- `GET /api/status` — Kibana connectivity check
- `POST /api/dashboards` — create dashboards (primary method)
- `GET /api/saved_objects/dashboard/{id}` — check dashboard existence
- `PUT /api/saved_objects/dashboard/{id}` — create/update dashboard (fallback)
- `POST /api/saved_objects/dashboard/{id}` — create dashboard (fallback)
- `DELETE /api/saved_objects/dashboard/{id}` — remove dashboard
- `POST /api/saved_objects/_bulk_delete` — bulk remove dashboards
- `POST /api/saved_objects/_import` — NDJSON dashboard import (last-resort fallback)
- `GET /api/saved_objects/_find` — search saved objects
- `GET /api/saved_objects/tag/{id}` — check tag existence
- `POST /api/saved_objects/tag/{id}` — create `cloudloadgen` tag
- `GET /api/data_views` — list data views
- `POST /api/data_views/data_view` — create data views
- `GET /api/alerting/rule/{id}` — check rule existence
- `POST /api/alerting/rule/{id}` — create alerting rule
- `POST /api/alerting/rule/{id}/_enable` — enable alerting rule
- `DELETE /api/alerting/rule/{id}` — remove alerting rule
- `GET /api/fleet/epm/packages/{name}` — resolve Fleet package version
- `POST /api/fleet/epm/packages/{name}/{version}` — install Fleet package
- `DELETE /api/fleet/epm/packages/{name}/{version}` — remove Fleet package
