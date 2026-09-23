#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

service="${1:-}"
node scripts/digitalocean-preflight.mjs "$service"

case "$service" in
  web)
    if ! node scripts/pdf-runtime-check.mjs; then
      echo '[warning] PDF renderer startup check failed; inspect the sanitized PDF_RUNTIME_FAILED code.' >&2
    fi
    exec /usr/bin/tini -g -- node ./node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port "${PORT:-3000}"
    ;;
  video-worker) exec /usr/bin/tini -g -- npm run video:worker ;;
  ai-worker) exec /usr/bin/tini -g -- npm run ai:worker ;;
  file-scan-worker) exec /usr/bin/tini -g -- npm run files:scan ;;
  cleanup-worker) exec /usr/bin/tini -g -- node --import ./scripts/ai-worker-runtime.mjs --require ./scripts/tsx-runtime-bootstrap.cjs --import tsx scripts/storage-cleanup-worker.ts ;;
  migrate) exec /usr/bin/tini -g -- ./node_modules/.bin/drizzle-kit migrate ;;
  *)
    echo '[fatal] Invalid DigitalOcean service type.' >&2
    exit 78
    ;;
esac
