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

# Access granted just before a boot can take a minute to apply, so keep trying for 10 minutes
# rather than starting the worker without its keys
secret() {
  local v
  for _ in $(seq 1 60); do
    v=$(gcloud secrets versions access latest --secret="$1" 2>/dev/null) && [ -n "$v" ] && { echo "$v"; return; }
    sleep 10
  done
  echo "could not read secret $1" >&2; return 1
}
umask 077
SB=$(secret forge-supabase-service-role)
EL=$(secret forge-elevenlabs)
printf 'SUPABASE_SERVICE_ROLE_KEY=%s\nELEVENLABS_API_KEY=%s\n' "$SB" "$EL" > /run/forge.env
unset SB EL

docker pull "$IMAGE"
docker rm -f forge-worker 2>/dev/null || true
docker run -d --name forge-worker --restart=always --env-file /run/forge.env \
  --log-driver=gcplogs "$IMAGE"
docker image prune -f
