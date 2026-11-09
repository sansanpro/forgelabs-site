#!/bin/bash
# Boot script for the render server (Debian 12 on Compute Engine). Runs on every boot, and on
# demand with `sudo google_metadata_script_runner startup`: installs Docker once, reads the keys
# from Secret Manager into a root-only file in /run (memory, gone on shutdown), then pulls the
# latest worker image and restarts the container.
set -euo pipefail
META=http://metadata.google.internal/computeMetadata/v1
attr() { curl -sf -H 'Metadata-Flavor: Google' "$META/instance/attributes/$1"; }
IMAGE=$(attr forge-image)
REGISTRY=${IMAGE%%/*}

if ! command -v docker >/dev/null; then
  apt-get update -q && apt-get install -yq docker.io
fi
gcloud auth configure-docker "$REGISTRY" --quiet

umask 077
{
  echo "SUPABASE_SERVICE_ROLE_KEY=$(gcloud secrets versions access latest --secret=forge-supabase-service-role)"
  echo "ELEVENLABS_API_KEY=$(gcloud secrets versions access latest --secret=forge-elevenlabs)"
} > /run/forge.env

docker pull "$IMAGE"
docker rm -f forge-worker 2>/dev/null || true
docker run -d --name forge-worker --restart=always --env-file /run/forge.env \
  --log-driver=gcplogs "$IMAGE"
docker image prune -f
