#!/usr/bin/env bash
# Wraps DAO E2E: compile + ts-node, teeing full terminal output to test-logs/.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOG_DIR="$ROOT/test-logs"
mkdir -p "$LOG_DIR"

# Match scripts/test-dao-e2e.ts newLogStamp() so app + terminal logs share a timestamp.
STAMP="$(node -e "const d=new Date().toISOString().replace(/[:.]/g,'-').replace('T','_').replace('Z',''); process.stdout.write(d)")"
TERMINAL_LOG="$LOG_DIR/dao-e2e-terminal-${STAMP}.log"

export DAO_E2E_LOG_STAMP="$STAMP"
export DAO_E2E_TERMINAL_LOG="$TERMINAL_LOG"

{
  echo "════════════════════════════════════════════════════════════════"
  echo "DAO E2E terminal capture"
  echo "Started: $(node -e "process.stdout.write(new Date().toISOString())")"
  echo "Terminal log: $TERMINAL_LOG"
  echo "App log:      $LOG_DIR/dao-e2e-${STAMP}.log"
  echo "Args: $*"
  echo "════════════════════════════════════════════════════════════════"
  npm run compile
  npx ts-node --project tsconfig.scripts.json scripts/test-dao-e2e.ts "$@"
} 2>&1 | tee "$TERMINAL_LOG"
