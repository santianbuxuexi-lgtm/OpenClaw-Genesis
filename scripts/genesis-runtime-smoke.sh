#!/usr/bin/env bash
set -euo pipefail

PROFILE="${PROFILE:-genesis-smoke}"
PORT="${PORT:-19101}"
REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
OPENCLAW="${REPO_ROOT}/openclaw.mjs"
export OPENCLAW_STATE_DIR="${OPENCLAW_STATE_DIR:-${HOME}/.openclaw-${PROFILE}}"
export NODE_DISABLE_COMPILE_CACHE="${NODE_DISABLE_COMPILE_CACHE:-1}"
BATCH="${REPO_ROOT}/scripts/genesis-smoke.batch.json"
LOG_DIR="${LOG_DIR:-${REPO_ROOT}/.genesis-smoke}"
STDOUT_LOG="${LOG_DIR}/gateway.stdout.log"
STDERR_LOG="${LOG_DIR}/gateway.stderr.log"
SOCIETY_LOG="${LOG_DIR}/society-smoke.json"
PROFILE_OVERRIDE_BACKUP="${LOG_DIR}/experiment-profile.backup.json"

mkdir -p "${LOG_DIR}"

if [[ "${RESET_STATE:-1}" == "1" ]]; then
  rm -rf "${OPENCLAW_STATE_DIR}"
fi

PROFILE_OVERRIDE='{"applied":false}'
if [[ -n "${OPENCLAW_GENESIS_SMOKE_PROFILE_PRESET:-}" || -n "${OPENCLAW_GENESIS_SMOKE_EXPERIMENT_PROFILE:-}" ]]; then
  PROFILE_OVERRIDE="$(node --import tsx "${REPO_ROOT}/scripts/genesis-smoke-profile.ts" --mode apply --backup-file "${PROFILE_OVERRIDE_BACKUP}")"
fi

node "${OPENCLAW}" --profile "${PROFILE}" config set --batch-file "${BATCH}" >/dev/null
VALIDATION="$(node "${OPENCLAW}" --profile "${PROFILE}" config validate --json)"
HEALTH_FILE="$(mktemp)"

cleanup() {
  if [[ -f "${PROFILE_OVERRIDE_BACKUP}" ]]; then
    node --import tsx "${REPO_ROOT}/scripts/genesis-smoke-profile.ts" --mode restore --backup-file "${PROFILE_OVERRIDE_BACKUP}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${GATEWAY_PID:-}" ]] && kill -0 "${GATEWAY_PID}" 2>/dev/null; then
    kill "${GATEWAY_PID}" 2>/dev/null || true
    wait "${GATEWAY_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

node "${OPENCLAW}" --profile "${PROFILE}" gateway run --allow-unconfigured --auth none --port "${PORT}" >"${STDOUT_LOG}" 2>"${STDERR_LOG}" &
GATEWAY_PID=$!

READY=0
for _ in $(seq 1 20); do
  if node "${OPENCLAW}" --profile "${PROFILE}" gateway --auth none --port "${PORT}" health --json >"${HEALTH_FILE}" 2>/dev/null; then
    READY=1
    break
  fi
  sleep 1
done

if [[ "${READY}" != "1" ]]; then
  echo "{\"status\":\"error\",\"reason\":\"gateway_not_ready\",\"stdoutLog\":\"${STDOUT_LOG}\",\"stderrLog\":\"${STDERR_LOG}\"}"
  exit 1
fi

HEALTH="$(cat "${HEALTH_FILE}")"
node --import tsx "${REPO_ROOT}/scripts/genesis-society-smoke.ts" --port "${PORT}" >"${SOCIETY_LOG}"

node -e "const fs = require('node:fs'); const [profile, port, stdoutLog, stderrLog, societyLog, validation, health, profileOverride] = process.argv.slice(1); const society = JSON.parse(fs.readFileSync(societyLog, 'utf8')); const summary = society?.society?.summary ?? {}; const experimentSignals = society?.society?.experimentSignals ?? summary?.experimentSignals ?? null; const compact = { status: 'ok', profile, port: Number(port), validation: JSON.parse(validation), health: JSON.parse(health), experimentOverride: JSON.parse(profileOverride), assessment: society?.assessment ?? null, experimentSignals, collaborationSummary: summary?.collaborationSummary ?? null, vitalitySummary: summary?.vitalitySummary ?? null, tick: society?.tick ? { decision: society.tick.decision ?? null, runCount: society.tick.tickState?.runCount ?? null } : null, pump: society?.pump ? { tickCount: Array.isArray(society.pump.ticks) ? society.pump.ticks.length : 0, termination: society.pump.termination ?? null, finalRunCount: society.pump.finalState?.tickState?.runCount ?? null } : null, seededVitality: society?.seededVitality ?? null, seededPlan: society?.seededPlan ?? null, activeDispatchCount: summary?.activeDispatchCount ?? null, reviveDispatchCount: summary?.reviveDispatchCount ?? null, stdoutLog, stderrLog, societyLog }; console.log(JSON.stringify(compact, null, 2));" "${PROFILE}" "${PORT}" "${STDOUT_LOG}" "${STDERR_LOG}" "${SOCIETY_LOG}" "${VALIDATION}" "${HEALTH}" "${PROFILE_OVERRIDE}"
