#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
MATRIX_DIR="${MATRIX_DIR:-${REPO_ROOT}/.genesis-smoke/matrix}"
STATE_BASE_DIR="${OPENCLAW_GENESIS_SMOKE_STATE_BASE_DIR:-${HOME}/.openclaw-genesis-smoke-matrix}"
if [[ "$#" -gt 0 ]]; then
  SCENARIOS=("$@")
else
  SCENARIOS=("baseline" "pressure" "runaway")
fi

mkdir -p "${MATRIX_DIR}" "${STATE_BASE_DIR}"

SCENARIO_ARGS=()
for scenario in "${SCENARIOS[@]}"; do
  scenario_dir="${MATRIX_DIR}/${scenario}"
  state_dir="${STATE_BASE_DIR}/${scenario}"
  mkdir -p "${scenario_dir}"
  rm -rf "${state_dir}"

  if [[ "${scenario}" == "baseline" ]]; then
    unset OPENCLAW_GENESIS_SMOKE_PROFILE_PRESET
  else
    export OPENCLAW_GENESIS_SMOKE_PROFILE_PRESET="${scenario}"
  fi

  PROFILE="genesis-smoke-${scenario}" \
  LOG_DIR="${scenario_dir}" \
  OPENCLAW_STATE_DIR="${state_dir}" \
  "${REPO_ROOT}/scripts/genesis-runtime-smoke.sh" > "${scenario_dir}/compact.json"

  SCENARIO_ARGS+=("--scenario" "${scenario}=${scenario_dir}/compact.json")
done

unset OPENCLAW_GENESIS_SMOKE_PROFILE_PRESET

node --import tsx "${REPO_ROOT}/scripts/genesis-smoke-matrix.ts" "${SCENARIO_ARGS[@]}"
