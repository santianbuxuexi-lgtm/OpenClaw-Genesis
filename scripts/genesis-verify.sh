#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
HEARTBEAT_MS="${GENESIS_VERIFY_HEARTBEAT_MS:-30000}"
SMOKE_OUTPUT_FILE="${GENESIS_VERIFY_SMOKE_OUTPUT_FILE:-${REPO_ROOT}/.genesis-smoke/verify-smoke.json}"
VERIFY_REPORT_FILE="${GENESIS_VERIFY_REPORT_FILE:-${REPO_ROOT}/.genesis-smoke/verify-report.json}"
TEST_ARGS=(
  "src/genesis/kernel/society-query.test.ts"
  "src/genesis/kernel/spawn.test.ts"
  "src/genesis/kernel/queue.test.ts"
  "src/genesis/kernel/server-smoke.test.ts"
)

mkdir -p "$(dirname "${SMOKE_OUTPUT_FILE}")"
mkdir -p "$(dirname "${VERIFY_REPORT_FILE}")"

run_step() {
  local label="$1"
  shift
  node "${REPO_ROOT}/scripts/genesis-step-watch.mjs" \
    --label "${label}" \
    --heartbeat-ms "${HEARTBEAT_MS}" \
    -- "$@"
}

run_step "a2ui-bundle" \
  corepack pnpm canvas:a2ui:bundle

run_step "genesis-tests" \
  corepack pnpm vitest run --maxWorkers=1 "${TEST_ARGS[@]}"

run_step "genesis-build" \
  env NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=6144}" corepack pnpm build:docker

run_step "genesis-smoke" \
  bash -lc "cd '${REPO_ROOT}' && ./scripts/genesis-runtime-smoke.sh > '${SMOKE_OUTPUT_FILE}'"

node "${REPO_ROOT}/scripts/genesis-verify-report.mjs" "${SMOKE_OUTPUT_FILE}" | tee "${VERIFY_REPORT_FILE}"
