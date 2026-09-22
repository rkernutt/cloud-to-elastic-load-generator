#!/bin/sh
# Build the image from a tar stream (reliable on Docker Desktop). Used by ../docker-up.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

sh scripts/assert-installer-for-docker.sh

IMAGE="${IMAGE:-cloud-to-elastic-load-generator:latest}"

# macOS tags files with the `com.apple.provenance` extended attribute. bsdtar copies
# xattrs into the archive by default, and BuildKit then fails to apply them while
# unpacking the context:
#   failed to read dockerfile: lsetxattr <path>: xattr "com.apple.provenance": no such file or directory
# Strip xattrs (and AppleDouble ._* files) from the archive. Flags are probed because
# GNU tar has --no-xattrs but not --no-mac-metadata.
TAR_FLAGS=""
for flag in --no-xattrs --no-mac-metadata; do
  if tar "$flag" -cf /dev/null package.json >/dev/null 2>&1; then
    TAR_FLAGS="${TAR_FLAGS} ${flag}"
  fi
done

# Keep the archive small; .dockerignore still applies on the daemon after extract.
# The excluded directories are developer tooling — the Dockerfile never COPYs them.
# shellcheck disable=SC2086 # TAR_FLAGS is an intentional list of flags
COPYFILE_DISABLE=1 tar -c $TAR_FLAGS \
  --exclude=node_modules \
  --exclude=dist \
  --exclude=.git \
  --exclude=.vite \
  --exclude=coverage \
  --exclude=.agents \
  --exclude=.claude \
  --exclude=.cursor \
  --exclude=hive-mind \
  -f - . \
| docker build -f Dockerfile -t "$IMAGE" -

echo "Built $IMAGE"
