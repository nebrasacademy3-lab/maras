#!/usr/bin/env bash
set -euo pipefail

site_url="${APP_URL:-${NEXT_PUBLIC_SITE_URL:-}}"
if [[ -z "${site_url}" ]]; then
  echo "APP_URL or NEXT_PUBLIC_SITE_URL is required." >&2
  exit 78
fi
scheduled_token="${SCHEDULED_TASK_TOKEN:-}"
if [[ "${#scheduled_token}" -lt 32 ]]; then
  echo "SCHEDULED_TASK_TOKEN must contain at least 32 characters." >&2
  exit 78
fi

curl --fail --silent --show-error \
  --retry 2 --retry-delay 2 --max-time 45 \
  --request POST \
  --header "x-scheduled-task-token: ${scheduled_token}" \
  "${site_url%/}/api/admin/notifications/dispatch"
printf '\n'
