#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
printf '\n  VELA EXPLORER — Build macOS app\n'
printf '  ------------------------------------\n\n'
if [[ "$(uname -s)" != "Darwin" ]]; then
  echo 'This installer must run on macOS. On Windows/Linux, use preview.html for the UI demo.'
  exit 1
fi
if ! xcode-select -p >/dev/null 2>&1; then
  echo 'Xcode Command Line Tools are required.'
  echo 'In Terminal, run: xcode-select --install'
  exit 1
fi
if ! command -v cargo >/dev/null 2>&1; then
  if [[ -x "$HOME/.cargo/bin/cargo" ]]; then export PATH="$HOME/.cargo/bin:$PATH"; fi
fi
if ! command -v cargo >/dev/null 2>&1; then
  echo 'Rust is missing. Install Rust from https://rustup.rs and rerun this file.'
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo 'Node.js is missing. Install Node.js 22 (LTS) and rerun this file.'
  exit 1
fi
printf 'Step 1/3: Installing dependencies...\n'
npm install --no-audit --no-fund
printf '\nStep 2/3: Checking frontend...\n'
npm run build
printf '\nStep 3/3: Creating .app and .dmg...\n'
npm run tauri build
printf '\nBUILD COMPLETE!\n'
APP_DIR="src-tauri/target/release/bundle/macos"
DMG_DIR="src-tauri/target/release/bundle/dmg"
if [[ -d "$DMG_DIR" ]]; then open "$DMG_DIR"; elif [[ -d "$APP_DIR" ]]; then open "$APP_DIR"; fi
printf 'Look inside %s and drag Vela Explorer.app to Applications.\n' "$DMG_DIR"
