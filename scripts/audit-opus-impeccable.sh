#!/usr/bin/env bash
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

echo "=== Menjalankan Subagent Auditor: Claude Opus 4.6 (Thinking) dengan Skill Impeccable ==="
agy --model claude-opus-4-6-thinking --print-timeout 15m0s --dangerously-skip-permissions -p "$(cat scripts/audit-prompt.txt)" > scripts/impeccable-audit-opus.md 2>&1
echo "=== Audit Opus 4.6 Selesai ==="
