#!/usr/bin/env bash
set -euo pipefail

site_url="${APP_URL:-${NEXT_PUBLIC_SITE_URL:-}}"
if [[ -z "${site_url}" ]]; then
  echo "APP_URL or NEXT_PUBLIC_SITE_URL is required." >&2
  exit 78
fi
if [[ -z "${ADMIN_API_TOKEN:-}" ]]; then
  echo "ADMIN_API_TOKEN is required." >&2
  exit 78
fi

curl --fail --silent --show-error \
  --retry 2 --retry-delay 2 --max-time 45 \
  --request POST \
  --header "x-admin-token: ${ADMIN_API_TOKEN}" \
  "${site_url%/}/api/admin/notifications/dispatch"
printf '\n'
