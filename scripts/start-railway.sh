#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${project_root}"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required for Railway PostgreSQL." >&2
  exit 78
fi

export NODE_ENV="production"
export HOSTNAME="0.0.0.0"
export UPLOAD_DIR="${UPLOAD_DIR:-${RAILWAY_VOLUME_MOUNT_PATH:-/data}/uploads}"
mkdir -p "${UPLOAD_DIR}"

if [[ "${RUN_DB_MIGRATIONS:-true}" == "true" ]]; then
  echo "Applying PostgreSQL migrations..."
  ./node_modules/.bin/drizzle-kit migrate
fi

if [[ "${AUTO_SEED_CATALOG:-true}" == "true" ]]; then
  echo "Preparing institutions, specialties, and core course content..."
  node --import tsx scripts/bootstrap-catalog.ts
fi

echo "Starting Meras Al-Elm on ${HOSTNAME}:${PORT:-3000}"
exec ./node_modules/.bin/next start --hostname "${HOSTNAME}" --port "${PORT:-3000}"
