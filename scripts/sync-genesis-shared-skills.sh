#!/usr/bin/env bash
set -euo pipefail

STATE_DIR="${OPENCLAW_STATE_DIR:-${OPENCLAW_GENESIS_STATE_DIR:-${HOME}/.openclaw-genesis}}"
TARGET_ROOT="${STATE_DIR}/shared-skills"
GENESIS_PERSONAL_ROOT="${STATE_DIR}/.agents/skills"

mkdir -p "${TARGET_ROOT}"
mkdir -p "${GENESIS_PERSONAL_ROOT}"

sync_root() {
  local source_root="$1"
  local target_name="$2"
  local target_root="${TARGET_ROOT}/${target_name}"

  mkdir -p "${target_root}"
  if [[ ! -d "${source_root}" ]]; then
    echo "skip ${target_name}: ${source_root} not found"
    return 0
  fi

  rsync -a --delete --copy-links "${source_root}/" "${target_root}/"
  echo "synced ${target_name}: ${source_root} -> ${target_root}"
}

sync_root "${HOME}/.openclaw/skills" "openclaw"
sync_root "${HOME}/skills" "skillhub"
sync_root "${HOME}/.agents/skills" "agents"

rsync -a --delete --copy-links "${TARGET_ROOT}/agents/" "${GENESIS_PERSONAL_ROOT}/"

echo "Genesis shared skills mirrored under ${TARGET_ROOT}"
