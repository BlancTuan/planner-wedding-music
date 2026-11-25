#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"
ROOT=$(starter_root "${BASH_SOURCE[0]}")

usage() {
  cat <<'EOF'
Chạy bootstrap và verify trong một bản sao tạm, rồi xóa bản sao đó.

Cách dùng:
  bash scripts/smoke-test.sh
  bash scripts/smoke-test.sh --help

Mọi file ghi ra nằm trong thư mục tạm. Script không cài gói, không ghi cấu hình
người dùng, và không mở trình duyệt.
EOF
}

if [[ $# -gt 0 ]]; then
  if [[ "$1" == "--help" && $# -eq 1 ]]; then
    usage
    exit 0
  fi
  die 2 "Tham số không hợp lệ. Chạy --help để xem cách dùng."
fi

WORKDIR=$(mktemp -d "${TMPDIR:-/tmp}/ai-starter-smoke.XXXXXX")
cleanup() {
  rm -rf -- "$WORKDIR"
}
trap cleanup EXIT

COPY="$WORKDIR/project copy"
mkdir -p -- "$COPY"
tar -C "$ROOT" \
  --exclude=.git \
  --exclude=.playwright \
  --exclude=.playwright-cli \
  --exclude='*.deb' \
  -cf - . | tar -C "$COPY" -xf -

tree_hash() {
  local dir=$1
  (
    cd -- "$dir"
    find . -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum
  )
}

hash_except_selection() {
  local dir=$1
  (
    cd -- "$dir"
    find . -type f ! -path './.cursor/project-profile.json' -print0 |
      LC_ALL=C sort -z | xargs -0 sha256sum
  )
}

require_exit() {
  local expected=$1
  shift
  set +e
  "$@"
  local actual=$?
  set -e
  if [[ "$actual" -ne "$expected" ]]; then
    die 1 "Lệnh trả về $actual, mong đợi $expected: $*"
  fi
}

printf 'smoke-dir=%s\n' "$COPY"
printf 'CONTRACT=disposable-copy\n'

before=$(tree_hash "$COPY")
require_exit 2 bash "$COPY/scripts/bootstrap.sh" --profile not-a-profile
after=$(tree_hash "$COPY")
if [[ "$before" != "$after" ]]; then
  die 1 "Profile không hợp lệ đã làm thay đổi bản sao."
fi
printf 'check=invalid-profile\n'

python3 - "$COPY/.cursor/project-profile.json" <<'PY'
import json
import sys
path = sys.argv[1]
with open(path, encoding="utf-8") as handle:
    data = json.load(handle)
data["preservedNote"] = "keep"
with open(path, "w", encoding="utf-8") as handle:
    json.dump(data, handle, indent=2, sort_keys=True, ensure_ascii=False)
    handle.write("\n")
PY
printf 'keep\n' > "$COPY/keep-me.txt"
before=$(tree_hash "$COPY")
dry_output=$(bash "$COPY/scripts/bootstrap.sh" --profile backend --dry-run)
printf '%s\n' "$dry_output"
case "$dry_output" in
  *DRY-RUN*) ;;
  *) die 1 "Dry-run không in DRY-RUN." ;;
esac
case "$dry_output" in
  *'no files written'*) ;;
  *) die 1 "Dry-run không xác nhận rằng không có file được ghi." ;;
esac
case "$dry_output" in
  *'profile=backend'*) ;;
  *) die 1 "Dry-run không chọn profile backend." ;;
esac
after=$(tree_hash "$COPY")
if [[ "$before" != "$after" ]]; then
  die 1 "Dry-run đã làm thay đổi bản sao."
fi
printf 'check=dry-run\n'

stable_before=$(hash_except_selection "$COPY")
require_exit 0 bash "$COPY/scripts/bootstrap.sh" --profile backend
stable_after=$(hash_except_selection "$COPY")
if [[ "$stable_before" != "$stable_after" ]]; then
  die 1 "Bootstrap đã sửa file ngoài .cursor/project-profile.json."
fi
if [[ "$(cat -- "$COPY/keep-me.txt")" != "keep" ]]; then
  die 1 "File người dùng keep-me.txt bị đổi."
fi
python3 - "$COPY/.cursor/project-profile.json" <<'PY'
import json
import sys
with open(sys.argv[1], encoding="utf-8") as handle:
    data = json.load(handle)
assert data["profile"] == "backend", data
assert data["react"] is False, data
assert data["preservedNote"] == "keep", data
assert data["profileSource"] == "profiles/backend.json", data
PY
printf 'check=bootstrap\n'

second_before=$(tree_hash "$COPY")
require_exit 0 bash "$COPY/scripts/bootstrap.sh" --profile backend
second_after=$(tree_hash "$COPY")
if [[ "$second_before" != "$second_after" ]]; then
  die 1 "Bootstrap lần hai đã đổi nội dung file."
fi
printf 'check=second-bootstrap\n'

require_exit 0 bash "$COPY/scripts/bootstrap.sh" --profile fullstack-web --react
python3 - "$COPY/.cursor/project-profile.json" <<'PY'
import json
import sys
with open(sys.argv[1], encoding="utf-8") as handle:
    data = json.load(handle)
assert data["profile"] == "fullstack-web", data
assert data["react"] is True, data
assert data["preservedNote"] == "keep", data
PY
printf 'check=react-flag\n'

require_exit 0 bash "$COPY/scripts/verify.sh"
printf 'check=verify-copy\n'

MIN="$WORKDIR/no speckit"
mkdir -p -- "$MIN/scripts" "$MIN/profiles"
cp -a -- "$ROOT/scripts/." "$MIN/scripts/"
cp -a -- "$ROOT/profiles/." "$MIN/profiles/"
set +e
contract_output=$(bash "$MIN/scripts/bootstrap.sh" --profile backend 2>&1)
contract_status=$?
set -e
printf '%s\n' "$contract_output"
if [[ "$contract_status" -ne 3 ]]; then
  die 1 "Bootstrap thiếu Spec Kit trả về $contract_status, mong đợi 3."
fi
if [[ -e "$MIN/.specify" ]]; then
  die 1 "Bootstrap đã tạo .specify dù không được phép."
fi
case "$contract_output" in
  *"specify init --here --non-interactive --integration cursor-agent --script sh --ignore-agent-tools"*) ;;
  *) die 1 "Thông báo thiếu Spec Kit không chứa lệnh specify init đã đối chiếu." ;;
esac
printf 'CONTRACT=speckit-missing-refused\n'
printf 'NOT-A-REAL-SPEC-KIT-INSTALL\n'
printf 'NOT-PROVEN cursor-invocation\n'
printf 'NOT-PROVEN browser-session\n'
printf 'smoke=pass\n'
