#!/usr/bin/env bash
# Build + sign the release APK in Docker, publish it to /data/loom/releases, redeploy the web app.
#   ./loom-build.sh            APK + web redeploy
#   ./loom-build.sh --no-web   APK only
#   ./loom-build.sh --web-only web redeploy only
# The keystore and its password are generated once into ~/.loom (kept outside the repo).
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE=/opt/homeserver/apps/loom/compose.yml
RELEASES=/data/loom/releases
KEYDIR="$HOME/.loom"
KEYSTORE="$KEYDIR/loom-release.jks"
PASSFILE="$KEYDIR/keystore.pass"
GRADLE="$REPO/client/android/app/build.gradle"
IMAGE=loom-android-builder

do_apk=1; do_web=1
case "${1:-}" in
  --no-web) do_web=0 ;;
  --web-only) do_apk=0 ;;
  "") ;;
  *) echo "unknown option $1" >&2; exit 1 ;;
esac

if (( do_apk )); then
  mkdir -p "$KEYDIR" "$RELEASES" "$HOME/.cache/loom-android"
  chmod 700 "$KEYDIR"

  echo "Preparing builder image"
  docker build -q -t "$IMAGE" "$REPO/tools/android-builder" >/dev/null

  # Keystore: created once. Losing it means reinstalling the app on every device.
  if [[ ! -f $KEYSTORE ]]; then
    echo "Creating keystore $KEYSTORE"
    umask 077
    head -c 24 /dev/urandom | base64 | tr -d '/+=' > "$PASSFILE"
    docker run --rm --user "$(id -u):$(id -g)" -v "$KEYDIR:/keys" "$IMAGE" \
      keytool -genkeypair -keystore /keys/loom-release.jks -alias loom -keyalg RSA -keysize 2048 \
      -validity 10000 -storepass "$(cat "$PASSFILE")" -keypass "$(cat "$PASSFILE")" -dname "CN=Loom"
  fi
  PASS="$(cat "$PASSFILE")"

  # Next version: one past the highest of build.gradle and what is already published.
  old_code=$(grep -oP 'versionCode\s+\K\d+' "$GRADLE")
  old_name=$(grep -oP 'versionName\s+"\K[^"]+' "$GRADLE")
  pub_code=$(ls "$RELEASES" 2>/dev/null | grep -oP '^loom-v[0-9.]+-\K\d+(?=\.apk$)' | sort -n | tail -1 || true)
  pub_name=$(ls "$RELEASES" 2>/dev/null | grep -oP '^loom-v\K[0-9.]+(?=-\d+\.apk$)' | sort -V | tail -1 || true)
  base_code=$(( old_code > ${pub_code:-0} ? old_code : ${pub_code:-0} ))
  base_name=$(printf '%s\n%s\n' "$old_name" "${pub_name:-0}" | sort -V | tail -1)
  new_code=$(( base_code + 1 ))
  new_name="${base_name%.*}.$(( ${base_name##*.} + 1 ))"

  # Bump before the build (Gradle reads the file); restore on failure so a failed build burns nothing.
  cp "$GRADLE" "$GRADLE.bak"
  trap 'mv -f "$GRADLE.bak" "$GRADLE"' ERR
  sed -i -E "s/versionCode\s+[0-9]+/versionCode $new_code/; s/versionName\s+\"[^\"]+\"/versionName \"$new_name\"/" "$GRADLE"
  echo "Building versionCode $new_code, versionName $new_name"

  docker run --rm --user "$(id -u):$(id -g)" \
    -e HOME=/home/builder -e GRADLE_USER_HOME=/cache/gradle -e npm_config_cache=/cache/npm \
    -e LOOM_KEYSTORE=/keys/loom-release.jks -e LOOM_KEY_ALIAS=loom \
    -e LOOM_KEYSTORE_PASSWORD="$PASS" -e LOOM_KEY_PASSWORD="$PASS" \
    -v "$REPO:/work" -v "$KEYDIR:/keys:ro" -v "$HOME/.cache/loom-android:/cache" \
    "$IMAGE" bash -euc '
      cd client
      npm ci
      npm run build
      npx cap sync android
      cd android
      sh ./gradlew --no-daemon assembleRelease
    '

  trap - ERR
  rm -f "$GRADLE.bak"
  apk="$REPO/client/android/app/build/outputs/apk/release/app-release.apk"
  [[ -f $apk ]] || { echo "APK not produced (is the release signing config unsigned?)" >&2; exit 1; }
  cp "$apk" "$RELEASES/loom-v$new_name-$new_code.apk"
  cp "$apk" "$RELEASES/loom.apk"
  echo "Published $RELEASES/loom-v$new_name-$new_code.apk (and loom.apk)"
  echo "Note: build.gradle now holds the new version; commit it when you commit."
fi

if (( do_web )); then
  echo "Redeploying web app"
  docker compose -f "$COMPOSE" up -d --build
fi
