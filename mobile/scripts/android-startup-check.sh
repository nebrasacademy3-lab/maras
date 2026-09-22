#!/usr/bin/env bash
set -euo pipefail
# Run only on the ephemeral CI emulator; never target a user's connected phone.
serial="emulator-5554"
export ANDROID_SERIAL="$serial"
app="sa.merasalelm.app"
evidence="${RUNNER_TEMP:?}/native-android"
mkdir -p "$evidence"
cleanup() { adb -s "$serial" emu kill >/dev/null 2>&1 || true; }
trap cleanup EXIT
printf 'no\n' | avdmanager create avd --force --name meras_ci --package 'system-images;android-36;google_apis;x86_64' --device pixel_6
"${ANDROID_HOME}/emulator/emulator" -avd meras_ci -port 5554 -no-window -no-audio -no-boot-anim -no-snapshot -gpu swiftshader_indirect -memory 3072 >"$evidence/emulator.log" 2>&1 &
adb -s "$serial" wait-for-device
ready=false
for _ in $(seq 1 120); do
  if [[ "$(adb -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == 1 ]]; then ready=true; break; fi
  sleep 2
done
[[ "$ready" == true ]]
adb -s "$serial" shell input keyevent 82
adb -s "$serial" install -r android/app/build/outputs/apk/release/app-release.apk
adb -s "$serial" logcat -c
adb -s "$serial" shell am start -W -S -n "$app/.MainActivity" | tee "$evidence/cold-start.txt"
sleep 8
adb -s "$serial" shell pidof "$app" >"$evidence/pid.txt"
adb -s "$serial" exec-out screencap -p >"$evidence/startup.png"
adb -s "$serial" shell uiautomator dump /sdcard/meras-startup.xml >/dev/null
adb -s "$serial" pull /sdcard/meras-startup.xml "$evidence/startup.xml" >/dev/null
# Read-only navigation through the same public course deep link users receive.
adb -s "$serial" shell am start -W -a android.intent.action.VIEW -d 'merasalelm://courses' "$app" >"$evidence/course-navigation.txt"
sleep 5
adb -s "$serial" shell pidof "$app" >/dev/null
adb -s "$serial" exec-out screencap -p >"$evidence/courses.png"
adb -s "$serial" shell dumpsys gfxinfo "$app" >"$evidence/frames.txt"
adb -s "$serial" shell dumpsys meminfo "$app" >"$evidence/memory.txt"
adb -s "$serial" logcat -d -b crash >"$evidence/crash.txt"
adb -s "$serial" logcat -d -s ReactNativeJS:E AndroidRuntime:E >"$evidence/runtime-errors.txt"
if grep -E 'FATAL EXCEPTION|Process: sa\.merasalelm\.app|Invariant Violation|TypeError:|ReferenceError:' "$evidence/crash.txt" "$evidence/runtime-errors.txt"; then exit 1; fi
printf '{"guest_startup":true,"public_course_navigation":true,"signed_for_store":false,"physical_device":false}\n' >"$evidence/result.json"
