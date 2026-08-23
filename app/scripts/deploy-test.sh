#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_ID="${FIREBASE_PROJECT_ID:-baby-growth-dvphu}"
CHANNEL_ID="${FIREBASE_CHANNEL_ID:-test}"
GOOGLE_CLIENT_ID="${VITE_GOOGLE_CLIENT_ID:-598629342498-c8ltki5l6hfn395ts1497hu5euks33kv.apps.googleusercontent.com}"
GOOGLE_DRIVE_BACKEND="${VITE_GOOGLE_DRIVE_BACKEND:-firebase}"

cd "$APP_DIR"
APP_VERSION="${VITE_APP_VERSION:-$(node -p "require('./package.json').version")}"
BUILD_SHA="${VITE_BUILD_SHA:-$(git rev-parse HEAD 2>/dev/null || echo local)}"
BUILD_REF="${VITE_BUILD_REF:-$(git branch --show-current 2>/dev/null || echo local)}"
BUILD_TIME="${VITE_BUILD_TIME:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"

if ! command -v firebase >/dev/null 2>&1; then
  echo "Firebase CLI chưa được cài đặt. Cài một lần bằng: npm install --global firebase-tools" >&2
  exit 1
fi

if ! firebase projects:list --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "Không thể truy cập Firebase project '$PROJECT_ID'. Hãy chạy 'firebase login' và kiểm tra quyền project." >&2
  exit 1
fi

export VITE_APP_VERSION="$APP_VERSION"
export VITE_BUILD_SHA="$BUILD_SHA"
export VITE_BUILD_REF="$BUILD_REF"
export VITE_BUILD_TIME="$BUILD_TIME"
export VITE_GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID"
export VITE_GOOGLE_DRIVE_BACKEND="$GOOGLE_DRIVE_BACKEND"
export VITE_FIREBASE_API_KEY="${VITE_FIREBASE_API_KEY:-}"
export VITE_FIREBASE_AUTH_DOMAIN="${VITE_FIREBASE_AUTH_DOMAIN:-baby-growth-dvphu.firebaseapp.com}"
export VITE_FIREBASE_PROJECT_ID="${VITE_FIREBASE_PROJECT_ID:-$PROJECT_ID}"
export VITE_FIREBASE_STORAGE_BUCKET="${VITE_FIREBASE_STORAGE_BUCKET:-$PROJECT_ID.firebasestorage.app}"
export VITE_FIREBASE_MESSAGING_SENDER_ID="${VITE_FIREBASE_MESSAGING_SENDER_ID:-}"
export VITE_FIREBASE_APP_ID="${VITE_FIREBASE_APP_ID:-}"

if [[ "$GOOGLE_DRIVE_BACKEND" == "firebase" && ( -z "$VITE_FIREBASE_API_KEY" || -z "$VITE_FIREBASE_APP_ID" ) ]]; then
  echo "VITE_FIREBASE_API_KEY và VITE_FIREBASE_APP_ID là bắt buộc khi bật Firebase OAuth backend." >&2
  exit 1
fi

echo "Building BabyGrowth test bundle..."
npm run lint
npm run build
npm --prefix functions run build

echo "Deploying Firebase Functions and Hosting preview channel '$CHANNEL_ID' to project '$PROJECT_ID'..."
firebase deploy --only functions,firestore --project "$PROJECT_ID"
DEPLOY_OUTPUT="$(firebase hosting:channel:deploy "$CHANNEL_ID" --project "$PROJECT_ID" --expires 7d 2>&1 | tee /dev/stderr)"

PREVIEW_URL="$(printf '%s\n' "$DEPLOY_OUTPUT" | grep -Eo 'https://[^[:space:]]+web\.app' | tail -n 1 || true)"

echo
echo "Test deployment completed."
if [[ -n "$PREVIEW_URL" ]]; then
  echo "Preview URL: $PREVIEW_URL"
else
  echo "Firebase CLI did not print a preview URL. Run 'firebase hosting:channel:list --project $PROJECT_ID' to find it."
fi

echo
echo "App version: v$APP_VERSION · build ${BUILD_SHA:0:7} · ref $BUILD_REF"
echo "Build time: $BUILD_TIME"
echo "Google OAuth Client ID configured: yes"
echo "Add the exact preview origin (scheme + host only) to Google Cloud Console → Google Auth Platform → Clients → Authorized JavaScript origins before testing OAuth."
echo "The preview channel expires after 7 days."
