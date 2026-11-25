#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"
ROOT=$(starter_root "${BASH_SOURCE[0]}")

usage() {
  cat <<'EOF'
Chọn profile và ghi .cursor/project-profile.json, rồi chạy kiểm tra chỉ đọc.

Cách dùng:
  bash scripts/bootstrap.sh --profile fullstack-web
  bash scripts/bootstrap.sh --profile backend
  bash scripts/bootstrap.sh --profile ai-app
  bash scripts/bootstrap.sh --profile fullstack-web --react
  bash scripts/bootstrap.sh --profile fullstack-web --dry-run
  bash scripts/bootstrap.sh --help

--dry-run chỉ in hành động dự kiến. Lần chạy thường không gọi specify init
khi .specify/ đã là tích hợp cursor-agent.
EOF
}

PROFILE=""
REACT=0
DRY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help)
      usage
      exit 0
      ;;
    --profile)
      if [[ $# -lt 2 ]]; then
        die 2 "Thiếu tên profile sau --profile."
      fi
      PROFILE=$2
      shift 2
      ;;
    --react)
      REACT=1
      shift
      ;;
    --dry-run)
      DRY=1
      shift
      ;;
    *)
      die 2 "Tham số không hợp lệ: $1"
      ;;
  esac
done

if [[ -z "$PROFILE" ]]; then
  die 2 "Thiếu --profile. Profile hợp lệ: fullstack-web, backend, ai-app."
fi

case "$PROFILE" in
  *[!a-z0-9-]*)
    die 2 "Tên profile không hợp lệ: $PROFILE"
    ;;
esac

ARGS=(write-profile --root "$ROOT" --profile "$PROFILE")
if [[ "$REACT" -eq 1 ]]; then
  ARGS+=(--react)
fi
if [[ "$DRY" -eq 1 ]]; then
  ARGS+=(--dry-run)
fi

set +e
python3 "$ROOT/scripts/lib/starter_check.py" "${ARGS[@]}"
status=$?
set -e

if [[ "$status" -ne 0 ]]; then
  exit "$status"
fi

if [[ "$DRY" -eq 1 ]]; then
  printf 'verify=not-run-because-dry-run\n'
  exit 0
fi

bash "$ROOT/scripts/verify.sh"
