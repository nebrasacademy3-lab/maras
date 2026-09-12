#!/bin/bash
set -euo pipefail
cd /opt/meras-scanner

if [ "$(id -u)" = 0 ]; then
  mkdir -p /run/clamav /var/log/clamav /var/lib/clamav
  chown -R clamav:clamav /run/clamav /var/log/clamav /var/lib/clamav
  exec gosu clamav /opt/meras-scanner/entrypoint.sh
fi

# Validate configuration before downloading signatures. The secret is never printed.
node --input-type=module -e 'import { createScannerServer } from "./server.mjs"; createScannerServer({ token: process.env.MALWARE_SCAN_TOKEN });'

has_database() {
  local file
  for file in /var/lib/clamav/main.cvd /var/lib/clamav/main.cld; do
    [ -s "$file" ] && return 0
  done
  return 1
}

echo "[scanner] Updating ClamAV signatures."
if ! freshclam --config-file=/etc/clamav/freshclam.conf; then
  if has_database; then
    echo "[scanner] Signature update failed; using cached signatures. Check freshclam logs and network access." >&2
  else
    echo "[scanner] No signature database is available. Check volume permissions and freshclam download errors; files remain blocked." >&2
    exit 1
  fi
fi

pids=()
cleanup() {
  trap - TERM INT
  if [ "${#pids[@]}" -gt 0 ]; then
    kill -TERM "${pids[@]}" 2>/dev/null || true
    wait "${pids[@]}" 2>/dev/null || true
  fi
}
trap 'cleanup; exit 0' TERM INT
freshclam --daemon --foreground --config-file=/etc/clamav/freshclam.conf &
pids+=("$!")
clamd --foreground --config-file=/etc/clamav/clamd.conf &
pids+=("$!")
node server.mjs &
pids+=("$!")
echo "[scanner] Processes started; /ready becomes healthy after a real ClamAV scan."

# A dead engine or updater must not leave an apparently running HTTP service.
set +e
wait -n "${pids[@]}"
status=$?
set -e
echo "[scanner] A required process stopped (exit $status); restarting the service." >&2
cleanup
exit 1
