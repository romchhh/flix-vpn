#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_FILE="${BOT_LOG_FILE:-${PROJECT_ROOT}/bot.log}"

# Resolve virtualenv path:
# 1) explicit VENV_PATH
# 2) bot/myenv (server default in your logs)
# 3) bot/.venv
# 4) project-root/.venv
if [ -n "${VENV_PATH:-}" ]; then
  CANDIDATES=("${VENV_PATH}")
else
  CANDIDATES=(
    "${SCRIPT_DIR}/myenv"
    "${SCRIPT_DIR}/.venv"
    "${PROJECT_ROOT}/.venv"
  )
fi

RESOLVED_VENV=""
for candidate in "${CANDIDATES[@]}"; do
  if [ -f "${candidate}/bin/activate" ]; then
    RESOLVED_VENV="${candidate}"
    break
  fi
done

if [ -z "${RESOLVED_VENV}" ]; then
  echo "Virtualenv not found."
  echo "Set VENV_PATH or create one of:"
  echo "  - ${SCRIPT_DIR}/myenv"
  echo "  - ${SCRIPT_DIR}/.venv"
  echo "  - ${PROJECT_ROOT}/.venv"
  exit 1
fi

# Auto-activate venv for runtime + imported console scripts
# shellcheck source=/dev/null
source "${RESOLVED_VENV}/bin/activate"

PYTHON_BIN="$(command -v python3)"
if [ -z "${PYTHON_BIN}" ]; then
  echo "python3 not found after virtualenv activation"
  exit 1
fi

nohup "${PYTHON_BIN}" "${SCRIPT_DIR}/main.py" >> "${LOG_FILE}" 2>&1 &
echo "Bot started (pid: $!)"
echo "Logs: ${LOG_FILE}"
echo "Venv: ${RESOLVED_VENV}"
