#!/usr/bin/env bash
# Deploy Kisan AI Calendar to Cloud Run.
#
# Usage:
#   gcloud auth login
#   PROJECT_ID=my-project \
#   AZURE_OPENAI_ENDPOINT=https://my-resource.openai.azure.com/ \
#   AZURE_OPENAI_DEPLOYMENT=gpt-4o \
#   ./deploy.sh
#
# First run: you'll be asked for your Azure OpenAI API key, which is stored in
# Secret Manager (never in the image or the service config).
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID to your Google Cloud project id}"
REGION="${REGION:-asia-south1}"            # Mumbai, closest region to Chhattisgarh
SERVICE="${SERVICE:-kisan-ai-calendar}"
BUCKET="${BUCKET:-${PROJECT_ID}-kisan-calendar-data}"
SECRET="${SECRET:-azure-openai-api-key}"
AZURE_OPENAI_ENDPOINT="${AZURE_OPENAI_ENDPOINT:?Set AZURE_OPENAI_ENDPOINT, e.g. https://my-resource.openai.azure.com/}"
AZURE_OPENAI_DEPLOYMENT="${AZURE_OPENAI_DEPLOYMENT:?Set AZURE_OPENAI_DEPLOYMENT to your model deployment name, e.g. gpt-4o}"
OPENAI_API_VERSION="${OPENAI_API_VERSION:-2024-10-21}"
ENV_VARS="DATA_FILE=/data/events.json,AZURE_OPENAI_ENDPOINT=${AZURE_OPENAI_ENDPOINT},AZURE_OPENAI_DEPLOYMENT=${AZURE_OPENAI_DEPLOYMENT},OPENAI_API_VERSION=${OPENAI_API_VERSION}"

gcloud config set project "$PROJECT_ID" >/dev/null

echo "==> Enabling APIs"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com storage.googleapis.com

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
RUN_SA="${RUN_SA:-${PROJECT_NUMBER}-compute@developer.gserviceaccount.com}"

echo "==> Bucket for saved tasks: gs://$BUCKET"
if ! gcloud storage buckets describe "gs://$BUCKET" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://$BUCKET" --location="$REGION" --uniform-bucket-level-access
fi
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" \
  --member="serviceAccount:$RUN_SA" --role=roles/storage.objectUser >/dev/null

echo "==> Azure OpenAI API key in Secret Manager: $SECRET"
if ! gcloud secrets describe "$SECRET" >/dev/null 2>&1; then
  read -rsp "Paste your Azure OpenAI API key: " KEY; echo
  printf '%s' "$KEY" | gcloud secrets create "$SECRET" --data-file=- --replication-policy=automatic
fi
gcloud secrets add-iam-policy-binding "$SECRET" \
  --member="serviceAccount:$RUN_SA" --role=roles/secretmanager.secretAccessor >/dev/null

echo "==> Building and deploying $SERVICE to $REGION"
# max-instances=1: tasks are stored in one JSON file, so only one instance may write it.
gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --service-account "$RUN_SA" \
  --allow-unauthenticated \
  --execution-environment gen2 \
  --memory 512Mi \
  --max-instances 1 \
  --timeout 300 \
  --set-secrets "AZURE_OPENAI_API_KEY=${SECRET}:latest" \
  --set-env-vars "$ENV_VARS" \
  --add-volume "name=data,type=cloud-storage,bucket=${BUCKET},mount-options=uid=1000;gid=1000" \
  --add-volume-mount "volume=data,mount-path=/data"

gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)'
