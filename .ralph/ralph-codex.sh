#!/usr/bin/env bash
# ralph-codex.sh — autonomous Ralph-style loop driving OpenAI Codex (codex exec)
# to implement svelte-fluid Epic 0001 phases from .ralph/prd.json.
#
# Design contract (matches PROMPT.md and the human's standing authorization):
#   - Works ONLY on a dedicated branch; NEVER pushes/merges (network is off in
#     the workspace-write sandbox, and the prompt forbids it anyway).
#   - Each iteration: codex picks the next unblocked task in prd.json, implements
#     it, runs the hard verification gate, commits, marks the task done.
#   - The loop never fakes completion: it stops only when every prd.json task is
#     "done" (jq), the sentinel is emitted, the iteration/wall caps hit, or codex
#     dies repeatedly.
#   - Idempotent + resumable: re-running picks up wherever prd.json left off.
#
# Not using set -e: we must survive a failed codex iteration and continue.
set -uo pipefail

# ---------------- Config (env-overridable) ----------------
REPO="${RALPH_REPO:?set RALPH_REPO}"
BRANCH="${RALPH_BRANCH:-epic-0001-phases}"
MODEL="${RALPH_MODEL:-gpt-5.3-codex-spark}"
REASONING="${RALPH_REASONING:-xhigh}"
PROMPT_FILE="${RALPH_PROMPT:-$REPO/.ralph/PROMPT.md}"
PRD_FILE="${RALPH_PRD:-$REPO/.ralph/prd.json}"
LOG_DIR="${RALPH_LOG_DIR:-$REPO/.ralph/logs}"
MAX_ITERS="${RALPH_MAX_ITERS:-60}"
ITER_TIMEOUT="${RALPH_ITER_TIMEOUT:-3000}"   # 50 min hard cap per codex iteration
MAX_WALL="${RALPH_MAX_WALL:-30600}"          # ~8.5h total wall-clock cap
SENTINEL="ALL_PHASES_COMPLETE"
CONSEC_FAIL_ABORT="${RALPH_CONSEC_FAIL_ABORT:-4}"  # stop if codex dies N times in a row

MASTER_LOG="$LOG_DIR/master.log"
STATUS_FILE="$LOG_DIR/STATUS"

mkdir -p "$LOG_DIR"

log() { printf '%s %s\n' "$(date -u +%H:%M:%S)" "$*" | tee -a "$MASTER_LOG"; }

# ---------------- Portable timeout (no coreutils `timeout` on macOS) ----------------
run_with_timeout() {
  local secs="$1"; shift
  "$@" &
  local pid=$!
  ( sleep "$secs"; kill -TERM "$pid" 2>/dev/null; sleep 10; kill -KILL "$pid" 2>/dev/null ) &
  local wd=$!
  wait "$pid"; local rc=$?
  kill -TERM "$wd" 2>/dev/null; wait "$wd" 2>/dev/null
  return "$rc"
}

# ---------------- prd.json helpers ----------------
tasks_total()     { jq '[.tasks[]] | length' "$PRD_FILE" 2>/dev/null || echo 0; }
tasks_done()      { jq '[.tasks[] | select(.status=="done")] | length' "$PRD_FILE" 2>/dev/null || echo 0; }
# Only todo/in_progress are "remaining work"; done + deferred + blocked are terminal.
tasks_remaining() { jq '[.tasks[] | select(.status=="todo" or .status=="in_progress")] | length' "$PRD_FILE" 2>/dev/null || echo 999; }
tasks_deferred()  { jq '[.tasks[] | select(.status=="deferred")] | length' "$PRD_FILE" 2>/dev/null || echo 0; }
tasks_blocked()   { jq '[.tasks[] | select(.status=="blocked")] | length' "$PRD_FILE" 2>/dev/null || echo 0; }
all_done()        { [ "$(tasks_remaining)" = "0" ]; }

write_status() {
  local iter="$1" phase="$2"
  {
    echo "updated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "phase: $phase"
    echo "iteration: $iter / $MAX_ITERS"
    echo "tasks_done: $(tasks_done) / $(tasks_total) (deferred: $(tasks_deferred), blocked: $(tasks_blocked), remaining: $(tasks_remaining))"
    echo "branch: $BRANCH"
    echo "head: $(git -C "$REPO" log --oneline -1 2>/dev/null)"
  } > "$STATUS_FILE"
}

# ---------------- Branch guard ----------------
cd "$REPO" || { log "FATAL: cannot cd $REPO"; exit 1; }
cur="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
if [ "$cur" != "$BRANCH" ]; then
  log "FATAL: expected branch '$BRANCH' but on '$cur'. Refusing to run."
  exit 1
fi
if [ "$cur" = "main" ] || [ "$cur" = "master" ]; then
  log "FATAL: refusing to run on $cur."; exit 1
fi

[ -f "$PROMPT_FILE" ] || { log "FATAL: missing $PROMPT_FILE"; exit 1; }
[ -f "$PRD_FILE" ]    || { log "FATAL: missing $PRD_FILE"; exit 1; }

log "=== ralph-codex starting ==="
log "repo=$REPO branch=$BRANCH model=$MODEL reasoning=$REASONING"
log "tasks: $(tasks_done)/$(tasks_total) done, $(tasks_remaining) remaining"

start=$(date +%s)
consec_fail=0

for ((i=1; i<=MAX_ITERS; i++)); do
  now=$(date +%s); elapsed=$((now - start))
  if [ "$elapsed" -ge "$MAX_WALL" ]; then log "STOP: wall-clock cap ($MAX_WALL s) reached."; break; fi
  if all_done; then log "STOP: all prd.json tasks are done."; break; fi
  if [ "$consec_fail" -ge "$CONSEC_FAIL_ABORT" ]; then
    log "STOP: $consec_fail consecutive codex failures — aborting for human review."; break
  fi

  write_status "$i" "running"
  iter_log="$LOG_DIR/iter-$(printf '%03d' "$i").log"
  last_msg="$LOG_DIR/iter-$(printf '%03d' "$i").last.txt"
  before_head="$(git rev-parse HEAD)"

  log "--- iteration $i/$MAX_ITERS (done $(tasks_done)/$(tasks_total), elapsed ${elapsed}s) ---"

  run_with_timeout "$ITER_TIMEOUT" \
    codex exec --skip-git-repo-check --sandbox workspace-write \
      -m "$MODEL" -C "$REPO" \
      -c "model_reasoning_effort=\"$REASONING\"" \
      -o "$last_msg" \
      < "$PROMPT_FILE" > "$iter_log" 2>&1
  rc=$?

  after_head="$(git rev-parse HEAD)"
  if [ "$rc" -eq 124 ] || [ "$rc" -eq 143 ] || [ "$rc" -eq 137 ]; then
    log "iteration $i: codex TIMED OUT (rc=$rc)."
  elif [ "$rc" -ne 0 ]; then
    log "iteration $i: codex exited rc=$rc (see $iter_log)."
  fi

  if [ "$before_head" != "$after_head" ]; then
    consec_fail=0
    log "iteration $i: new commit(s):"
    git --no-pager log --oneline "$before_head..$after_head" | sed 's/^/    /' | tee -a "$MASTER_LOG"
  else
    consec_fail=$((consec_fail + 1))
    log "iteration $i: NO new commit (consec_fail=$consec_fail)."
  fi

  if [ -f "$last_msg" ] && grep -q "$SENTINEL" "$last_msg" 2>/dev/null && all_done; then
    log "STOP: sentinel '$SENTINEL' emitted and all tasks done."
    break
  fi

  sleep 5
done

write_status "$i" "finished"
log "=== ralph-codex finished: $(tasks_done)/$(tasks_total) tasks done ==="
log "Running final verification snapshot…"
{ bun run test && bun run check && bun run prepack; } > "$LOG_DIR/final-verify.log" 2>&1 \
  && log "final verification: PASS" \
  || log "final verification: FAIL (see $LOG_DIR/final-verify.log)"
log "Branch '$BRANCH' is ready for human review (NOT pushed)."
