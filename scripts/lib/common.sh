#!/usr/bin/env bash

starter_root() {
  local source dir
  source=$1
  while [[ -L "$source" ]]; do
    dir=$(CDPATH= cd -P -- "$(dirname -- "$source")" && pwd)
    source=$(readlink -- "$source")
    if [[ "$source" != /* ]]; then
      source="$dir/$source"
    fi
  done
  dir=$(CDPATH= cd -P -- "$(dirname -- "$source")" && pwd)
  CDPATH= cd -P -- "$dir/.." && pwd
}

die() {
  local code=$1
  shift
  printf '%s\n' "$*" >&2
  exit "$code"
}
