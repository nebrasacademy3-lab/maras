#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${project_root}"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[fatal] DATABASE_URL is required. In Railway, reference the PostgreSQL service variable (for example ${{Postgres.DATABASE_URL}})." >&2
  exit 78
fi

export NODE_ENV="production"
export HOSTNAME="0.0.0.0"
export UPLOAD_DIR="${UPLOAD_DIR:-${RAILWAY_VOLUME_MOUNT_PATH:-/data}/uploads}"
mkdir -p "${UPLOAD_DIR}"

echo "Waiting for PostgreSQL..."
db_ready="false"
for attempt in $(seq 1 20); do
  if node - <<'NODE'
const { Client } = require('pg');
const cs = process.env.DATABASE_URL;
const sslEnabled = process.env.DATABASE_SSL === 'true' || /[?&]sslmode=(require|verify-ca|verify-full)/i.test(cs || '');
const rejectUnauthorized = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false';
const client = new Client({ connectionString: cs, connectionTimeoutMillis: 7000, ssl: sslEnabled ? { rejectUnauthorized } : undefined });
(async () => {
  try { await client.connect(); await client.query('select 1'); process.exitCode = 0; }
  catch (e) { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1; }
  finally { await client.end().catch(() => undefined); }
})();
NODE
  then
    db_ready="true"
    echo "PostgreSQL is ready."
    break
  fi
  echo "PostgreSQL not ready yet (${attempt}/20); retrying in 3s..."
  sleep 3
done

if [[ "${db_ready}" != "true" ]]; then
  echo "[fatal] PostgreSQL could not be reached after retries. Check DATABASE_URL and the Postgres service." >&2
  exit 79
fi

if [[ "${RUN_DB_MIGRATIONS:-true}" == "true" ]]; then
  echo "Applying PostgreSQL migrations..."
  ./node_modules/.bin/drizzle-kit migrate
fi

if [[ "${AUTO_SEED_CATALOG:-true}" == "true" ]]; then
  echo "Preparing institutions, specialties, and core course content..."
  if ! node --import tsx scripts/bootstrap-catalog.ts; then
    echo "[warning] Catalog bootstrap failed, but the web/API service will still start. Review logs and rerun bootstrap later." >&2
  fi
fi

echo "Starting Meras Al-Elm on ${HOSTNAME}:${PORT:-3000}"
exec ./node_modules/.bin/next start --hostname "${HOSTNAME}" --port "${PORT:-3000}"
