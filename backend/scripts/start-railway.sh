#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
persist_root="${RAILWAY_VOLUME_MOUNT_PATH:-${project_root}/.railway-data}"
runtime_env_file="$(mktemp)"

mkdir -p "${persist_root}" "${persist_root}/xdg" "${persist_root}/tmp" "${persist_root}/wrangler-logs"
chmod 600 "${runtime_env_file}"
trap 'rm -f "${runtime_env_file}"' EXIT

write_runtime_var() {
  local variable_name="$1"
  local variable_value="${!variable_name:-}"
  variable_value="${variable_value//\\/\\\\}"
  variable_value="${variable_value//\"/\\\"}"
  variable_value="${variable_value//$'\n'/}"
  printf '%s="%s"\n' "${variable_name}" "${variable_value}" >> "${runtime_env_file}"
}

for variable_name in APP_URL NEXT_PUBLIC_SITE_URL TAP_SECRET_KEY TAP_PUBLIC_KEY TAP_MERCHANT_ID VIDEO_SIGNING_SECRET ADMIN_API_TOKEN ADMIN_UPLOAD_TOKEN RESEND_API_KEY EMAIL_FROM ASSISTANT_PROVIDER GEMINI_API_KEY GEMINI_MODEL OTP_PROVIDER VIDEO_PROVIDER; do
  write_runtime_var "${variable_name}"
done

export XDG_CONFIG_HOME="${persist_root}/xdg"
export TMPDIR="${persist_root}/tmp"
export WRANGLER_WRITE_LOGS=false
export WRANGLER_LOG_PATH="${persist_root}/wrangler-logs/wrangler.log"

cd "${project_root}"
./node_modules/.bin/wrangler d1 migrations apply DB --local --persist-to "${persist_root}" --config wrangler.railway.jsonc
exec ./node_modules/.bin/wrangler dev --local --config wrangler.railway.jsonc --env-file "${runtime_env_file}" --ip 0.0.0.0 --port "${PORT:-3000}" --persist-to "${persist_root}" --log-level warn --show-interactive-dev-session=false
