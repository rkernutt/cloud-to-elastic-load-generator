#!/bin/sh
# Fail before `docker compose build` if installer/ is incomplete.
# Run from repository root: ./scripts/assert-installer-for-docker.sh

set -eu

cd "$(dirname "$0")/.."

missing=""
for d in \
  installer/aws-custom-dashboards \
  installer/aws-custom-ml-jobs/jobs \
  installer/azure-custom-dashboards \
  installer/gcp-custom-dashboards
do
  if [ ! -d "$d" ]; then
    missing="${missing}${missing:+, }$d"
  fi
done

if [ -n "$missing" ]; then
  echo "ERROR: Docker needs these directories on disk (they are missing):"
  echo "  $missing"
  echo ""
  echo "docker compose only COPYs what exists in your working tree."
  echo ""
  echo "Fix (try in order):"
  echo "  1) Restore from the current commit (normal clone — not sparse):"
  echo "       git checkout HEAD -- installer/aws-custom-dashboards installer/aws-custom-ml-jobs"
  echo "     If Git says pathspec did not match, update the branch: git fetch && git checkout main && git pull"
  echo ""
  echo "  2) Only if sparse-checkout is enabled (git config --get core.sparseCheckout → true):"
  echo "       git sparse-checkout add installer/aws-custom-dashboards installer/aws-custom-ml-jobs"
  echo "       git sparse-checkout reapply"
  echo "     If you see 'no sparse-checkout to add to', use step 1 instead — sparse mode is off."
  echo ""
  echo "  3) To leave sparse mode and get the full tree:"
  echo "       git sparse-checkout disable"
  echo ""
  echo "Verify:"
  echo "  ls -d installer/aws-custom-dashboards installer/aws-custom-ml-jobs"
  exit 1
fi

# Docker omits symlink targets outside the build context, so the image can miss AWS assets while
# `find` here still sees files on the Mac. Real dirs under this repo are required.
REPO_ROOT=$(pwd -P)
for name in installer/aws-custom-dashboards installer/aws-custom-ml-jobs; do
  if [ -L "$name" ]; then
    echo "ERROR: $name is a symlink. Docker will not ship its contents in the image."
    ls -la "$name" 2>/dev/null || true
    echo ""
    echo "Replace it with a normal directory from git (removes only the link, not an off-repo copy):"
    echo "  rm $name"
    echo "  git checkout HEAD -- $name"
    echo "Then re-run this script and docker compose build."
    exit 1
  fi
  if [ -d "$name" ]; then
    resolved=$(cd "$name" && pwd -P)
    case "$resolved" in
      "$REPO_ROOT"/*) ;;
      *)
        echo "ERROR: $name resolves outside the repository ($resolved)."
        echo "Repo root is $REPO_ROOT — Docker cannot add that path to the build context."
        exit 1
        ;;
    esac
  fi
done

aws_d=$(find installer/aws-custom-dashboards -maxdepth 1 -name '*-dashboard.json' 2>/dev/null | wc -l | tr -d ' ')
aws_ml=$(find installer/aws-custom-ml-jobs/jobs -maxdepth 1 -name '*.json' 2>/dev/null | wc -l | tr -d ' ')
if [ "${aws_d:-0}" -lt 1 ] || [ "${aws_ml:-0}" -lt 1 ]; then
  echo "ERROR: AWS installer dirs exist but have no JSON assets (aws dashboards=$aws_d ml job files=$aws_ml)."
  exit 1
fi

echo "installer/ OK for Docker (aws *-dashboard.json: $aws_d, aws ml *.json: $aws_ml)."
