#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-debug}"

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
ANDROID_DIR="$PROJECT_ROOT/android"

ANDROID_SDK="/opt/homebrew/share/android-commandlinetools"
JDK17_HOME="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"

if [[ ! -d "$JDK17_HOME" ]]; then
  JDK17_HOME="/opt/homebrew/Cellar/openjdk@17/17.0.19/libexec/openjdk.jdk/Contents/Home"
fi

if [[ "$MODE" != "debug" && "$MODE" != "release" ]]; then
  echo "Usage: ./build-android-apk.sh [debug|release]"
  exit 1
fi

if [[ ! -d "$ANDROID_SDK" ]]; then
  echo "ERROR: Android SDK not found: $ANDROID_SDK"
  exit 1
fi

if [[ ! -d "$JDK17_HOME" ]]; then
  echo "ERROR: JDK 17 not found"
  echo "Try: brew install openjdk@17"
  exit 1
fi

export JAVA_HOME="$JDK17_HOME"
export ANDROID_HOME="$ANDROID_SDK"
export ANDROID_SDK_ROOT="$ANDROID_SDK"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

echo "==> Project root: $PROJECT_ROOT"
echo "==> Build mode: $MODE"
echo "==> Android SDK: $ANDROID_HOME"
echo "==> JAVA_HOME: $JAVA_HOME"
echo "==> Java version:"
"$JAVA_HOME/bin/java" -version

cd "$PROJECT_ROOT"

if [[ ! -d "node_modules" ]]; then
  echo "==> Installing npm dependencies..."
  npm install
fi

if [[ ! -f "$ANDROID_DIR/gradlew" ]]; then
  echo "==> android/ not found, running expo prebuild..."
  npx expo prebuild --platform android
fi

echo "==> Writing android/local.properties"
echo "sdk.dir=$ANDROID_SDK" > "$ANDROID_DIR/local.properties"

cd "$ANDROID_DIR"

echo "==> Checking Gradle JVM:"
./gradlew -Dorg.gradle.java.home="$JAVA_HOME" --version

echo "==> Stopping old Gradle daemons..."
./gradlew -Dorg.gradle.java.home="$JAVA_HOME" --stop || true

if [[ "$MODE" == "release" ]]; then
  echo "==> Building release APK..."
  ./gradlew -Dorg.gradle.java.home="$JAVA_HOME" assembleRelease
  APK_PATH="$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
else
  echo "==> Building debug APK..."
  ./gradlew -Dorg.gradle.java.home="$JAVA_HOME" assembleDebug
  APK_PATH="$ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"
fi

echo
echo "==> Done."
echo "APK path:"
echo "$APK_PATH"

if [[ -f "$APK_PATH" ]]; then
  echo
  echo "Install with:"
  echo "adb install -r \"$APK_PATH\""
else
  echo
  echo "WARNING: Expected APK not found. Check android/app/build/outputs/apk/"
fi