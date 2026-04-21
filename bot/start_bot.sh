#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
VENV_PATH="${VENV_PATH:-${SCRIPT_DIR}/.venv}"
PYTHON_BIN="${VENV_PATH}/bin/python3"
LOG_FILE="${BOT_LOG_FILE:-${PROJECT_ROOT}/bot.log}"

if [ ! -x "${PYTHON_BIN}" ]; then
  PYTHON_BIN="$(command -v python3)"
fi

nohup "${PYTHON_BIN}" "${SCRIPT_DIR}/main.py" >> "${LOG_FILE}" 2>&1 &
echo "Bot started (pid: $!)"
echo "Logs: ${LOG_FILE}"
