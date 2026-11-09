#!/bin/bash
# Deploys the render worker to Google Cloud: one always-on Compute Engine server running the
# engine/ Docker image. Run from the repo root.
#
#   engine/deploy/gcp.sh setup    once: registry, service account, image, server
#   engine/deploy/gcp.sh secrets  once, by the owner: the keys into Secret Manager, then restart
#   engine/deploy/gcp.sh deploy   after engine changes: rebuild the image, restart the worker
#   engine/deploy/gcp.sh logs     the worker's recent log lines
#
# The keys are read from .env.local (SUPABASE_SERVICE_ROLE_KEY, ELEVENLABS_API_KEY) and never
# printed. To change one later, rerun `secrets` (it adds a new version and restarts the worker).
set -euo pipefail
PROJECT=${GCP_PROJECT:-oceanic-citadel-507922-a4}
REGION=us-central1
ZONE=us-central1-a
VM=forge-worker
SA=forge-worker@$PROJECT.iam.gserviceaccount.com
IMAGE=$REGION-docker.pkg.dev/$PROJECT/forge/worker:latest
g() { gcloud --project "$PROJECT" --quiet "$@"; }

# Built here with Docker (for the server's x86 CPU) and pushed as you, so no build service or
# extra permissions are needed. Docker Desktop must be running.
build() {
  gcloud auth configure-docker $REGION-docker.pkg.dev --quiet >/dev/null 2>&1
  docker buildx build --platform linux/amd64 -t "$IMAGE" --push engine
}

secret() {  # name, variable in .env.local
  node --env-file=.env.local -e "const v=process.env['$2']; if(!v) process.exit(1); process.stdout.write(v)" \
    > /dev/null || { echo "$2 is missing from .env.local" >&2; exit 1; }
  g secrets describe "$1" >/dev/null 2>&1 || g secrets create "$1" --replication-policy=automatic
  node --env-file=.env.local -e "process.stdout.write(process.env['$2'])" | g secrets versions add "$1" --data-file=-
  g secrets add-iam-policy-binding "$1" --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor >/dev/null
}

case "${1:-}" in
  setup)
    g artifacts repositories describe forge --location=$REGION >/dev/null 2>&1 ||
      g artifacts repositories create forge --location=$REGION --repository-format=docker
    g iam service-accounts describe "$SA" >/dev/null 2>&1 ||
      g iam service-accounts create forge-worker --display-name="App Ad Studio render worker"
    for role in roles/artifactregistry.reader roles/logging.logWriter; do
      g projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$SA" --role=$role --condition=None >/dev/null
    done
    build
    g compute instances describe $VM --zone=$ZONE >/dev/null 2>&1 ||
      g compute instances create $VM --zone=$ZONE --machine-type=e2-standard-2 \
        --image-family=debian-12 --image-project=debian-cloud --boot-disk-size=20GB \
        --service-account="$SA" --scopes=cloud-platform \
        --metadata=forge-image="$IMAGE" --metadata-from-file=startup-script=engine/deploy/startup.sh
    ;;
  secrets)
    secret forge-supabase-service-role SUPABASE_SERVICE_ROLE_KEY
    secret forge-elevenlabs ELEVENLABS_API_KEY
    g compute instances describe $VM --zone=$ZONE >/dev/null 2>&1 && g compute instances reset $VM --zone=$ZONE
    ;;
  deploy)
    build
    g compute instances add-metadata $VM --zone=$ZONE --metadata-from-file=startup-script=engine/deploy/startup.sh
    g compute ssh $VM --zone=$ZONE --command='sudo google_metadata_script_runner startup' ||
      g compute instances reset $VM --zone=$ZONE
    ;;
  logs)
    g logging read "resource.type=gce_instance AND logName:gcplogs-docker-driver" --limit=50 --freshness=1d \
      --format='value(timestamp,jsonPayload.data)'
    ;;
  *) sed -n '2,12p' "$0"; exit 1 ;;
esac
