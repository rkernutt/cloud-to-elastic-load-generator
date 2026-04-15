#!/bin/sh
# Build the image from a tar stream (reliable on Docker Desktop). Used by ../docker-up.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

sh scripts/assert-installer-for-docker.sh

IMAGE="${IMAGE:-cloud-to-elastic-load-generator:latest}"

# Keep the archive small; .dockerignore still applies on the daemon after extract.
tar -c \
  --exclude=node_modules \
  --exclude=dist \
  --exclude=.git \
  --exclude=.vite \
  --exclude=coverage \
  -f - . \
| docker build -f Dockerfile -t "$IMAGE" -

echo "Built $IMAGE"
