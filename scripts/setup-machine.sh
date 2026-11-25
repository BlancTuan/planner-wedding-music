#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"
ROOT=$(starter_root "${BASH_SOURCE[0]}")

usage() {
  cat <<'EOF'
Kiểm tra công cụ và skill đã có trên máy này.

Cách dùng:
  bash scripts/setup-machine.sh
  bash scripts/setup-machine.sh --help

Script chỉ in phiên bản, skill cục bộ và hướng dẫn cài đặt thủ công.
Script không cài gói, không nâng cấp, không tải trình duyệt và không đổi cấu hình Cursor.
EOF
}

if [[ $# -gt 0 ]]; then
  if [[ "$1" == "--help" && $# -eq 1 ]]; then
    usage
    exit 0
  fi
  die 2 "Tham số không hợp lệ. Chạy --help để xem cách dùng."
fi

missing=0
report_tool() {
  local name=$1
  local path
  path=$(command -v "$name" || true)
  if [[ -z "$path" ]]; then
    printf 'tool %s=missing\n' "$name"
    missing=1
    return
  fi
  local version
  version=$("$path" --version 2>&1 | head -n 1 || true)
  printf 'tool %s=%s\n' "$name" "$version"
}

printf 'root=%s\n' "$ROOT"
for tool in bash git python3 node npm specify; do
  report_tool "$tool"
done
if command -v uv >/dev/null 2>&1; then
  report_tool uv
else
  printf 'tool uv=optional-absent\n'
fi
if command -v playwright-cli >/dev/null 2>&1; then
  printf 'tool playwright-cli=present\n'
else
  printf 'tool playwright-cli=absent\n'
fi

printf 'project-local skills:\n'
found_skill=0
for group in ".agents/skills" ".cursor/skills"; do
  if [[ -d "$ROOT/$group" ]]; then
    for skill_dir in "$ROOT/$group"/*; do
      if [[ -f "$skill_dir/SKILL.md" ]]; then
        found_skill=1
        printf 'skill-present %s/%s\n' "$group" "$(basename -- "$skill_dir")"
      fi
    done
  fi
done
if [[ "$found_skill" -eq 0 ]]; then
  printf 'skill-present none\n'
  missing=1
fi

python3 "$ROOT/scripts/lib/starter_check.py" browser
printf 'Script này không cài và không nâng cấp gói nào.\n'

if [[ "$missing" -ne 0 ]]; then
  cat <<'EOF'
manual-install Công cụ còn thiếu được cài trong tài khoản người dùng. Script không chạy các lệnh này.
manual-install Node.js và npm: dùng bản cài theo người dùng, không dùng sudo npm install -g.
manual-install Git trên Ubuntu khi lệnh git vắng mặt: sudo apt-get install git
manual-install specify: uv tool install specify-cli
manual-install Tên gói specify-cli lấy từ uv receipt của bản specify 1.4.2 đã cài. Không chạy lại khi specify --version đã in ra.
manual-install Skill project-local đã có trong .agents/skills và .cursor/skills thì giữ nguyên, không cài đè.
manual-install Không chạy playwright install và không cài Chrome trên ubuntu20.04-x64.
EOF
  exit 1
fi

printf 'manual-install Không cần cài thêm. Skill cục bộ được giữ nguyên.\n'
printf 'manual-install Không chạy playwright install và không cài Chrome trên ubuntu20.04-x64.\n'
exit 0
