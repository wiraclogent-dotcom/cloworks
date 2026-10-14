#!/usr/bin/env bash
# Runs the READ-ONLY e2e smoke tests against a deployed Vercel preview.
#   bash scripts/e2e-preview.sh https://cloworks-git-<branch>-wira17.vercel.app
# Secrets are typed in (hidden) and passed to this one run only; nothing is written to disk.
# tests/e2e/flows (writes data) is never run here: previews may share the production database.
set -euo pipefail
url="${1:?usage: bash scripts/e2e-preview.sh <preview-url>}"
url="${url%/}"

read -rsp "Vercel 'Protection Bypass for Automation' secret (empty if the preview is public): " bypass; echo

# Fail fast while Vercel Deployment Protection still sends us to vercel.com/login.
status=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' -H "x-vercel-protection-bypass: ${bypass}" "$url/signin")
if [[ "$status" == 30[1278]*"vercel.com/sso-api"* || "$status" == 401* ]]; then
  echo "The preview is still behind Vercel Authentication (got: ${status%% *})." >&2
  echo "Create the secret in Vercel > cloworks > Settings > Deployment Protection > Protection Bypass for Automation," >&2
  echo "then run this script again and paste it at the first prompt." >&2
  exit 1
fi

read -rp  "Account email on the preview: " email
read -rsp "Password for that account: " password; echo

APP_URL="$url" VERCEL_AUTOMATION_BYPASS_SECRET="$bypass" PREVIEW_EMAIL="$email" PREVIEW_PASSWORD="$password" \
  E2E_TELEMETRY_DISABLED=1 npx e2e run tests/e2e/auth.setup.e2e.ts tests/e2e/smoke
