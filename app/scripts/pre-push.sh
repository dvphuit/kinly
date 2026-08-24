#!/usr/bin/env bash
# Kinly Git Pre-Push Hook
# Runs Lighthouse test before allowing push to remote

echo ""
echo "🚀 [Kinly Pre-Push] Running Lighthouse audit before pushing..."
echo "------------------------------------------------------------"

REPO_ROOT="$(git rev-parse --show-toplevel)"
APP_DIR="$REPO_ROOT/app"

if [ ! -d "$APP_DIR" ]; then
  echo "⚠️  App directory not found at $APP_DIR. Skipping Lighthouse pre-push hook."
  exit 0
fi

if ! grep -q '"test:lighthouse"' "$APP_DIR/package.json" 2>/dev/null; then
  echo "⚠️  Script 'test:lighthouse' không tồn tại trong branch này. Bỏ qua kiểm tra."
  exit 0
fi

# Run lighthouse test in app/
(cd "$APP_DIR" && npm run test:lighthouse)
LH_EXIT_CODE=$?

if [ $LH_EXIT_CODE -ne 0 ]; then
  echo ""
  echo "❌ [Kinly Pre-Push] Lighthouse audit failed (exit code: $LH_EXIT_CODE)."
  echo "👉 Vui lòng kiểm tra báo cáo lỗi ở trên và khắc phục trước khi push."
  echo "👉 Nếu cần push khẩn cấp (bỏ qua kiểm tra), sử dụng: git push --no-verify"
  echo "------------------------------------------------------------"
  exit 1
fi

echo ""
echo "✅ [Kinly Pre-Push] Lighthouse audit passed! Cho phép git push."
echo "------------------------------------------------------------"
exit 0
