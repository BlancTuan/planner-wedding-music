#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"
ROOT=$(starter_root "${BASH_SOURCE[0]}")

usage() {
  cat <<'EOF'
Kiểm tra cấu trúc starter, công cụ, và trạng thái trình duyệt. Không sửa file.

Cách dùng:
  bash scripts/verify.sh
  bash scripts/verify.sh --help

Bốn kết quả được in riêng:
  STRUCTURE
  TOOLS
  CURSOR_INVOCATION
  BROWSER_RUNTIME

Sự tồn tại của file không chứng minh Cursor đã gọi skill hoặc subagent.
Trạng thái trình duyệt không được tính là kiểm tra trình duyệt thành công.
EOF
}

if [[ $# -gt 0 ]]; then
  if [[ "$1" == "--help" && $# -eq 1 ]]; then
    usage
    exit 0
  fi
  die 2 "Tham số không hợp lệ. Chạy --help để xem cách dùng."
fi

if ! command -v python3 >/dev/null 2>&1; then
  die 1 "Thiếu python3. verify.sh không dùng npx và không tự cài gói."
fi

python3 "$ROOT/scripts/lib/starter_check.py" verify --root "$ROOT"
