#!/usr/bin/env bash
set -euo pipefail
# This build is simulator-only, without distribution certificates or provisioning profiles.
evidence="${RUNNER_TEMP:?}/native-ios"
mkdir -p "$evidence"
app=$(find "$RUNNER_TEMP/meras-ios/Build/Products/Release-iphonesimulator" -maxdepth 1 -type d -name '*.app' -print -quit)
[[ -n "$app" ]]
xcrun simctl list devices available -j >"$evidence/devices.json"
udid=$(python3 - "$evidence/devices.json" <<'PY'
import json, sys
for devices in json.load(open(sys.argv[1]))['devices'].values():
    for device in devices:
        if device.get('isAvailable') and device['name'].startswith('iPhone'):
            print(device['udid']); sys.exit(0)
raise SystemExit('No available iPhone simulator')
PY
)
trap 'xcrun simctl shutdown "$udid" >/dev/null 2>&1 || true' EXIT
xcrun simctl boot "$udid" || true
xcrun simctl bootstatus "$udid" -b
xcrun simctl install "$udid" "$app"
xcrun simctl launch "$udid" sa.merasalelm.app | tee "$evidence/launch.txt"
pid=$(awk '{print $NF}' "$evidence/launch.txt" | tail -1)
sleep 8
kill -0 "$pid"
xcrun simctl io "$udid" screenshot "$evidence/startup.png"
xcrun simctl openurl "$udid" 'merasalelm://courses'
sleep 5
kill -0 "$pid"
xcrun simctl io "$udid" screenshot "$evidence/courses.png"
find "$app" -name PrivacyInfo.xcprivacy -print >"$evidence/privacy-manifests.txt"
test -s "$evidence/privacy-manifests.txt"
printf '{"guest_startup":true,"public_course_navigation":true,"simulator_only":true,"store_signed":false}\n' >"$evidence/result.json"
