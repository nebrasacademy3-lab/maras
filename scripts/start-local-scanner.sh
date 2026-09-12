#!/usr/bin/env bash
# Private, unprivileged ClamAV side-process for the supplied Railway Docker image.
# Set MALWARE_SCAN_URL or CLAMD_HOST for an external scanner instead.
set -euo pipefail
if [[ "${LOCAL_MALWARE_SCANNER_ENABLED:-false}" != "true" || -n "${MALWARE_SCAN_URL:-}" || -n "${CLAMD_HOST:-}" ]]; then exit 0; fi
command -v clamd >/dev/null || { echo '[files] ClamAV is missing from this image; downloads stay protected.' >&2; exit 78; }
run_dir="/tmp/meras-clamav"
db_dir="${CLAMAV_DATABASE_DIR:-${RAILWAY_VOLUME_MOUNT_PATH:-/data}/clamav}"
socket="${CLAMD_SOCKET:-${run_dir}/clamd.sock}"
for value in "$db_dir" "$socket"; do [[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] || exit 78; done
mkdir -p "$run_dir" "$db_dir" "$(dirname "$socket")"
chmod 700 "$run_dir" "$db_dir"
cat > "$run_dir/clamd.conf" <<CONFIG
Foreground yes
LocalSocket $socket
LocalSocketMode 600
FixStaleSocket yes
DatabaseDirectory $db_dir
TemporaryDirectory $run_dir
MaxThreads 2
MaxQueue 8
ReadTimeout 45
CommandReadTimeout 10
StreamMaxLength 100M
MaxFileSize 100M
MaxScanSize 200M
MaxScanTime 30000
MaxRecursion 16
MaxFiles 1000
AlertExceedsMax yes
AlertEncrypted yes
ConcurrentDatabaseReload no
SelfCheck 600
LogTime yes
CONFIG
cat > "$run_dir/freshclam.conf" <<CONFIG
DatabaseOwner $(id -un)
DatabaseDirectory $db_dir
DatabaseMirror database.clamav.net
ScriptedUpdates yes
NotifyClamd $run_dir/clamd.conf
ConnectTimeout 15
ReceiveTimeout 90
MaxAttempts 3
CONFIG
updater_pid=""
scanner_pid=""
stop() { [[ -z "$updater_pid" ]] || kill "$updater_pid" 2>/dev/null || true; [[ -z "$scanner_pid" ]] || kill "$scanner_pid" 2>/dev/null || true; exit 0; }
trap stop TERM INT
# Refresh in a supervised loop; a successful no-change check also proves freshness.
(
  while true; do
    if freshclam --config-file="$run_dir/freshclam.conf" --stdout; then touch "$db_dir/.last-successful-update"; sleep 3600;
    else echo '[files] Signature update unavailable; retry scheduled. No scan bypass is enabled.' >&2; sleep 300; fi
  done
) &
updater_pid=$!
while true; do
  # A stored database is usable only after a verified update within seven days.
  if [[ -n "$(find "$db_dir" -maxdepth 1 -name '.last-successful-update' -mmin -10080 -print -quit)" ]] && [[ -f "$db_dir/daily.cvd" || -f "$db_dir/daily.cld" ]]; then
    echo '[files] Starting the private malware scanner.'
    clamd --config-file="$run_dir/clamd.conf" &
    scanner_pid=$!
    while kill -0 "$scanner_pid" 2>/dev/null; do
      sleep 60
      if [[ -z "$(find "$db_dir" -maxdepth 1 -name '.last-successful-update' -mmin -10080 -print -quit)" ]]; then
        echo '[files] Signature freshness expired; stopping scanner until updates recover.' >&2
        kill "$scanner_pid" 2>/dev/null || true
      fi
    done
    wait "$scanner_pid" || true
    scanner_pid=""
  else echo '[files] Waiting for a current signature database; pending files remain protected.' >&2; fi
  sleep 30
done
