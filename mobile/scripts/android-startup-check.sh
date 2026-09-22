#!/usr/bin/env bash
set -euo pipefail
# Only the ephemeral CI emulator is permitted; never target a connected phone.
[[ "${GITHUB_ACTIONS:-}" == true && "${RUNNER_OS:-}" == Linux ]] || { echo 'An isolated Linux GitHub runner is required.' >&2; exit 2; }
: "${RUNNER_TEMP:?}" "${ANDROID_HOME:?}"
serial="emulator-5554"
export ANDROID_SERIAL="$serial"
app="sa.merasalelm.app"
evidence="$RUNNER_TEMP/native-android"
mkdir -p "$evidence"
# sdkmanager/avdmanager and emulator use different HOME fallbacks on hosted CI.
# Bind every supported location to one private directory, including legacy tools.
export ANDROID_SDK_HOME="$RUNNER_TEMP/meras-android-home"
export ANDROID_USER_HOME="$ANDROID_SDK_HOME/.android"
export ANDROID_EMULATOR_HOME="$ANDROID_USER_HOME"
export ANDROID_AVD_HOME="$ANDROID_USER_HOME/avd"
mkdir -p "$ANDROID_AVD_HOME"
emulator_pid=""
adb_ci() { timeout --kill-after=5s 30s adb -s "$serial" "$@"; }
cleanup() {
  if [[ -n "$emulator_pid" ]]; then
    timeout --kill-after=2s 5s adb -s "$serial" emu kill >/dev/null 2>&1 || true
    kill "$emulator_pid" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
if timeout 10s adb devices | grep -q "^${serial}[[:space:]]"; then
  echo 'Refusing to replace a pre-existing emulator.' >&2; exit 2
fi
printf 'no\n' | timeout --kill-after=5s 120s avdmanager create avd --force --name meras_ci --path "$ANDROID_AVD_HOME/meras_ci.avd" --package 'system-images;android-36;google_apis;x86_64' --device pixel_6 >"$evidence/avd-create.txt" 2>&1
# Fail immediately when AVD discovery is wrong, rather than wait forever in adb.
timeout 15s "${ANDROID_HOME}/emulator/emulator" -list-avds >"$evidence/avd-list.txt"
grep -qx 'meras_ci' "$evidence/avd-list.txt" || { echo 'Created AVD is not discoverable.' >&2; exit 1; }
"${ANDROID_HOME}/emulator/emulator" -avd meras_ci -port 5554 -no-window -no-audio -no-boot-anim -no-snapshot -gpu swiftshader_indirect -memory 3072 >"$evidence/emulator.log" 2>&1 &
emulator_pid=$!
ready=false
boot_deadline=$((SECONDS + 300))
while (( SECONDS < boot_deadline )); do
  kill -0 "$emulator_pid" 2>/dev/null || { tail -n 40 "$evidence/emulator.log" >&2; exit 1; }
  if [[ "$(timeout 5s adb -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)" == 1 ]]; then ready=true; break; fi
  sleep 2
done
[[ "$ready" == true ]] || { echo 'Emulator boot deadline exceeded.' >&2; exit 1; }
adb_ci shell input keyevent 82
for key in window_animation_scale transition_animation_scale animator_duration_scale; do adb_ci shell settings put global "$key" 0; done
timeout --kill-after=5s 120s adb -s "$serial" install -r android/app/build/outputs/apk/release/app-release.apk
adb_ci logcat -c
adb_ci shell am start -W -S -n "$app/.MainActivity" | tee "$evidence/cold-start.txt"
# Wait for a real accessible screen, not merely a living native process/splash.
wait_screen() {
  local label="$1" expected="$2" screen_deadline=$((SECONDS + 90))
  while (( SECONDS < screen_deadline )); do
    adb_ci shell pidof "$app" >"$evidence/pid.txt"
    if adb_ci shell uiautomator dump /sdcard/meras-ci.xml >/dev/null 2>&1 && adb_ci pull /sdcard/meras-ci.xml "$evidence/$label.xml" >/dev/null 2>&1; then
      if python3 - "$evidence/$label.xml" "$expected" <<'PY'
import re, sys, xml.etree.ElementTree as ET
root = ET.parse(sys.argv[1]).getroot()
text = ' '.join(n.get('text', '') + ' ' + n.get('content-desc', '') for n in root.iter('node') if n.get('package') == 'sa.merasalelm.app')
raise SystemExit(0 if re.search(sys.argv[2], text) else 1)
PY
      then
        adb_ci exec-out screencap -p >"$evidence/$label.png"
        return 0
      fi
    fi
    sleep 2
  done
  adb_ci exec-out screencap -p >"$evidence/$label-failed.png" || true
  echo "Accessible screen not ready: $label" >&2
  return 1
}
wait_screen startup 'اكتشف موادك|Discover your courses'
# Public navigation and blocked payment links are the same for every user.
adb_ci shell am start -W -a android.intent.action.VIEW -d 'merasalelm://courses' "$app" >"$evidence/course-navigation.txt"
wait_screen courses 'ابحث عن مادتك|تصفية المواد|الجامعة أو الكلية|Find your course'
adb_ci shell am start -W -a android.intent.action.VIEW -d 'merasalelm://checkout' "$app" >"$evidence/blocked-checkout.txt"
wait_screen blocked-checkout 'اكتشف موادك|Discover your courses'
adb_ci shell dumpsys gfxinfo "$app" >"$evidence/frames.txt"
adb_ci shell dumpsys meminfo "$app" >"$evidence/memory.txt"
adb_ci logcat -d -b crash >"$evidence/crash.txt"
adb_ci logcat -d -s ReactNativeJS:E AndroidRuntime:E >"$evidence/runtime-errors.txt"
if grep -E 'FATAL EXCEPTION|Process: sa\.merasalelm\.app|Invariant Violation|TypeError:|ReferenceError:' "$evidence/crash.txt" "$evidence/runtime-errors.txt"; then exit 1; fi
printf '{"guest_startup":true,"public_course_navigation":true,"checkout_link_blocked":true,"accessible_screens_verified":true,"signed_for_store":false,"physical_device":false}\n' >"$evidence/result.json"
