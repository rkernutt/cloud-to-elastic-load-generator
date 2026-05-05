# syntax=docker/dockerfile:1
# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install deps without lifecycle scripts — postinstall runs `copy-icons`, which imports `src/data/iconMap.ts`
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --ignore-scripts

# Copy only what Vite needs so edits to docs/tests/docker files don’t invalidate this layer
COPY index.html vite.config.ts tsconfig.json tsconfig.node.json ./
COPY scripts ./scripts
COPY public ./public
COPY src ./src
COPY installer ./installer
# `src/setup/workflowYaml.ts` inlines this file with `?raw` at build time — Vite/Rollup
# resolves it during `npm run build`, so it must be present in the build context.
COPY workflows ./workflows
# Fail fast when the build context omits installer JSON (sparse clone, wrong directory, or broken
# sync). A healthy tree sends ~3–5MB+ to the daemon; ~100KB almost always means dashboards/ML
# never reached the image — npm run build would then ship an empty AWS (or other) bundle.
RUN set -eu; \
  aws_d=$(find installer/aws-custom-dashboards -maxdepth 1 -name '*-dashboard.json' 2>/dev/null | wc -l); \
  aws_ml=$(find installer/aws-custom-ml-jobs/jobs -maxdepth 1 -name '*.json' 2>/dev/null | wc -l); \
  az_d=$(find installer/azure-custom-dashboards -maxdepth 1 -name '*-dashboard.json' 2>/dev/null | wc -l); \
  gcp_d=$(find installer/gcp-custom-dashboards -maxdepth 1 -name '*-dashboard.json' 2>/dev/null | wc -l); \
  aws_packs_ok=1; \
  if [ ! -f installer/aws-loadgen-packs/index.mjs ] || [ ! -f installer/aws-loadgen-packs/registry.mjs ]; then aws_packs_ok=0; fi; \
  if [ "$aws_d" -lt 1 ] || [ "$aws_ml" -lt 1 ] || [ "$az_d" -lt 1 ] || [ "$gcp_d" -lt 1 ] || [ "$aws_packs_ok" -ne 1 ]; then \
    echo "ERROR: installer/ in this build is incomplete."; \
    echo "  aws *-dashboard.json (top-level): $aws_d (need >= 1)"; \
    echo "  aws ml jobs/*.json:               $aws_ml (need >= 1)"; \
    echo "  azure *-dashboard.json:          $az_d (need >= 1)"; \
    echo "  gcp *-dashboard.json:             $gcp_d (need >= 1)"; \
    echo "  aws-loadgen-packs (index+registry): $aws_packs_ok (need 1)"; \
    echo ""; \
    echo "Those directories must exist on the Mac/Linux host before docker build — COPY cannot create them."; \
    echo "If the host has AWS files but Docker does not: installer/aws-custom-dashboards or aws-custom-ml-jobs may be symlinks"; \
    echo "to paths outside the repo — Docker omits those from the context. Use real dirs: rm <link> && git checkout HEAD -- <path>"; \
    echo "Run ./scripts/assert-installer-for-docker.sh on the host before docker compose build."; \
    echo ""; \
    du -sh installer 2>/dev/null || true; \
    echo ""; \
    echo "--- installer/ (what actually reached this build) ---"; \
    ls -la installer 2>&1 | head -40 || true; \
    echo ""; \
    echo "--- installer/aws-custom-dashboards (expect ~100+ *-dashboard.json) ---"; \
    ls -la installer/aws-custom-dashboards 2>&1 | head -20 || true; \
    echo "--- installer/aws-custom-ml-jobs/jobs ---"; \
    ls -la installer/aws-custom-ml-jobs/jobs 2>&1 | head -20 || true; \
    echo ""; \
    echo "Fix on the host at the same path you run docker compose from:"; \
    echo "  • First (normal repo, sparse-checkout OFF): git checkout HEAD -- installer/aws-custom-dashboards installer/aws-custom-ml-jobs installer/aws-loadgen-packs"; \
    echo "    If pathspec did not match: git fetch && git pull on a branch that contains those paths."; \
    echo "  • If git sparse-checkout add fails with no sparse-checkout: sparse mode is disabled — use checkout above, not sparse-checkout."; \
    echo "  • If core.sparseCheckout is true: git sparse-checkout add ... && git sparse-checkout reapply"; \
    echo "  • Or: git sparse-checkout disable"; \
    echo "  • If the host has full installer/ but the image is still incomplete: ./docker-up or npm run docker:up"; \
    echo "    then: docker compose up -d --no-build"; \
    exit 1; \
  fi
RUN npm run copy-icons && npm run build

# ── Stage 2: Serve ────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

# Install nginx and supervisor
RUN apk add --no-cache nginx supervisor

# Nginx config
COPY nginx.conf /etc/nginx/http.d/default.conf

# Copy built SPA assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy proxy server (CommonJS .cjs — works regardless of package "type" in image)
COPY proxy.cjs /app/proxy.cjs

# Supervisor config to run nginx + node proxy together
RUN mkdir -p /var/log/supervisor
COPY supervisord.conf /etc/supervisord.conf

# Fix nginx dirs
RUN mkdir -p /var/lib/nginx/tmp /run/nginx && \
    chown -R nginx:nginx /var/lib/nginx /run/nginx /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost/health || exit 1

CMD ["supervisord", "-c", "/etc/supervisord.conf"]
