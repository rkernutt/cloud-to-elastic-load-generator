# GCP sample documents

Reference JSON produced by the GCP generators for **[Cloud Loadgen for Elastic](../../README.md)**. Paths mirror the app: **`samples/gcp/{logs,metrics,traces}/`**.

Regenerate **all** clouds (including GCP) from the repo root:

```bash
npm run samples
```

Verify **all** clouds:

```bash
npm run samples:verify
```

Samples use fixed timestamps where applicable and a small error rate for reproducibility (see export scripts).
