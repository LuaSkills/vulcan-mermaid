#!/usr/bin/env bash
set -euo pipefail
# ProjectRoot is the independent skill repository containing this script.
# ProjectRoot 是包含本脚本的独立技能仓库。
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# PythonCommand is the available Python interpreter used by tests and runtime verification.
# PythonCommand 是测试与运行时验证使用的可用 Python 解释器。
PYTHON_COMMAND="${PYTHON_COMMAND:-python3}"
cd "$PROJECT_ROOT"
"$PYTHON_COMMAND" -X utf8 -m unittest discover -s tests -v
bash scripts/setup_debug.sh
"$PYTHON_COMMAND" -X utf8 scripts/verify_runtime.py
bash scripts/debug_skill.sh validate
bash scripts/debug_skill.sh package
