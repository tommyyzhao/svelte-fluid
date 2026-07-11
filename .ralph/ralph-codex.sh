#!/usr/bin/env bash
# ralph-codex.sh — autonomous Ralph-style loop driving OpenAI Codex (codex exec)
# against an env-selected PRD and prompt.
#
# Design contract (matches PROMPT.md and the human's standing authorization):
#   - Works ONLY on a dedicated branch; NEVER pushes/merges (network is off in
#     the workspace-write sandbox, and the prompt forbids it anyway).
#   - Each iteration: codex picks the next unblocked task in prd.json, implements
#     it, runs the hard verification gate, commits, marks the task done.
#   - The loop never fakes completion: it distinguishes completed, human-gated,
#     and blocked outcomes and otherwise stops only at iteration/wall caps or
#     repeated Codex failures.
#   - Idempotent + resumable: re-running picks up wherever prd.json left off.
#
# Not using set -e: we must survive a failed codex iteration and continue.
set -uo pipefail

# ---------------- Config (env-overridable) ----------------
REPO="${RALPH_REPO:?set RALPH_REPO}"
PRD_FILE="${RALPH_PRD:-$REPO/.ralph/prd.json}"
PROMPT_FILE="${RALPH_PROMPT:-$REPO/.ralph/PROMPT.md}"
# Resolve the branch from the selected PRD, not the legacy default PRD. This is
# what makes alternate roadmaps safe to invoke through RALPH_PRD.
BRANCH="${RALPH_BRANCH:-$(jq -r '.branch // "backlog-roadmap"' "$PRD_FILE" 2>/dev/null || echo backlog-roadmap)}"
# gpt-5.5 @ xhigh ONLY. gpt-5.3-codex-spark is banned for this repo: it is too
# weak for the engine tasks and burned a whole run producing near-nothing.
MODEL="${RALPH_MODEL:-gpt-5.5}"
REASONING="${RALPH_REASONING:-xhigh}"
LOG_DIR="${RALPH_LOG_DIR:-$REPO/.ralph/logs}"
MAX_ITERS="${RALPH_MAX_ITERS:-60}"
ITER_TIMEOUT="${RALPH_ITER_TIMEOUT:-4500}"   # 75 min hard cap (governor-bucket-a is 15+ files + repeated gate runs)
MAX_WALL="${RALPH_MAX_WALL:-30600}"          # ~8.5h total wall-clock cap
SENTINEL="ALL_PHASES_COMPLETE"
HUMAN_SENTINEL="HUMAN_GATE_REACHED"
BLOCKED_SENTINEL="IMPLEMENTATION_BLOCKED"
CONSEC_FAIL_ABORT="${RALPH_CONSEC_FAIL_ABORT:-4}"  # stop if codex dies N times in a row
WORKTREE_MARKER="${RALPH_WORKTREE_MARKER:-$REPO/.ralph-disposable-worktree}"

MASTER_LOG="$LOG_DIR/master.log"
STATUS_FILE="$LOG_DIR/STATUS"

mkdir -p "$LOG_DIR"

log() { printf '%s %s\n' "$(date -u +%H:%M:%S)" "$*" | tee -a "$MASTER_LOG"; }

# ---------------- Portable timeout (no coreutils `timeout` on macOS) ----------------
run_with_timeout() {
  # $1 = timeout secs, $2 = stdin file (backgrounded jobs default stdin to
  # /dev/null unless explicitly redirected, so the prompt MUST be redirected
  # here, not at the call site), $3.. = command.
  local secs="$1"; local infile="$2"; shift 2
  "$@" < "$infile" &
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

tasks_selectable() {
  jq '. as $root | [
    $root.tasks[] as $task
    | select($task.status=="todo" or $task.status=="in_progress")
    | select(all($task.depends_on[]?; . as $dependency | any($root.tasks[]; .id==$dependency and .status=="done")))
  ] | length' "$PRD_FILE" 2>/dev/null || echo 0
}

human_waiting() {
  jq '[.tasks[] | select(.status=="human")] | length' "$PRD_FILE" 2>/dev/null || echo 0
}

blocked_waiting() {
  jq '[.tasks[] | select(.status=="blocked")] | length' "$PRD_FILE" 2>/dev/null || echo 0
}

required_remaining() {
  jq '[.tasks[] | select(.status=="todo" or .status=="in_progress" or .status=="human" or .status=="blocked")] | length' "$PRD_FILE" 2>/dev/null || echo 999
}

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
[ -f "$WORKTREE_MARKER" ] || {
  log "FATAL: disposable-worktree marker missing: $WORKTREE_MARKER"
  exit 1
}

# A linked worktree has a per-worktree git dir beneath the common git dir. The
# primary checkout reports the same path for both and is never safe for Ralph's
# automated recovery behavior.
git_dir="$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)"
common_dir="$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)"
if [ "$git_dir" = "$common_dir" ]; then
  log "FATAL: refusing to run in the primary worktree; create a disposable linked worktree."
  exit 1
fi

# Existing tracked edits make ownership ambiguous. Existing untracked files are
# allowed and snapshotted so failure recovery never removes them.
if ! git diff --quiet || ! git diff --cached --quiet; then
  log "FATAL: tracked worktree changes exist before Ralph starts."
  exit 1
fi
baseline_untracked="$(mktemp -t ralph-untracked.XXXXXX)"
git ls-files --others --exclude-standard > "$baseline_untracked"

cleanup_baseline() { rm -f "$baseline_untracked"; }
trap cleanup_baseline EXIT

recover_iteration() {
  git restore --source=HEAD --staged --worktree -- . >/dev/null 2>&1
  git ls-files --others --exclude-standard | while IFS= read -r path; do
    if ! grep -Fqx -- "$path" "$baseline_untracked"; then
      rm -rf -- "$path"
    fi
  done
}

log "=== ralph-codex starting ==="
log "repo=$REPO branch=$BRANCH model=$MODEL reasoning=$REASONING"
log "tasks: $(tasks_done)/$(tasks_total) done, $(tasks_remaining) remaining"

start=$(date +%s)
consec_fail=0

for ((i=1; i<=MAX_ITERS; i++)); do
  now=$(date +%s); elapsed=$((now - start))
  if [ "$elapsed" -ge "$MAX_WALL" ]; then log "STOP: wall-clock cap ($MAX_WALL s) reached."; break; fi
  if [ "$(tasks_selectable)" = "0" ]; then
    if [ "$(required_remaining)" = "0" ]; then
      log "STOP: all required PRD work is complete; gated fast-follows remain dormant."
      break
    elif [ "$(blocked_waiting)" -gt 0 ]; then
      log "STOP: $BLOCKED_SENTINEL"
      break
    elif [ "$(human_waiting)" -gt 0 ]; then
      log "STOP: $HUMAN_SENTINEL"
      break
    fi
  fi
  if [ "$consec_fail" -ge "$CONSEC_FAIL_ABORT" ]; then
    log "STOP: $consec_fail consecutive codex failures — aborting for human review."; break
  fi

  write_status "$i" "running"
  iter_log="$LOG_DIR/iter-$(printf '%03d' "$i").log"
  last_msg="$LOG_DIR/iter-$(printf '%03d' "$i").last.txt"
  # Snapshot the prd done-set BEFORE codex (codex marks tasks done but cannot
  # write .git in its sandbox — the loop commits on its behalf).
  before_done_ids="$(jq -r '.tasks[]|select(.status=="done")|.id' "$PRD_FILE" 2>/dev/null | sort)"

  log "--- iteration $i/$MAX_ITERS (done $(tasks_done)/$(tasks_total), elapsed ${elapsed}s) ---"

  run_with_timeout "$ITER_TIMEOUT" "$PROMPT_FILE" \
    codex exec --skip-git-repo-check --sandbox workspace-write \
      -m "$MODEL" -C "$REPO" \
      -c "model_reasoning_effort=\"$REASONING\"" \
      -o "$last_msg" \
      > "$iter_log" 2>&1
  rc=$?
  if [ "$rc" -eq 124 ] || [ "$rc" -eq 143 ] || [ "$rc" -eq 137 ]; then
    log "iteration $i: codex TIMED OUT (rc=$rc)."
  elif [ "$rc" -ne 0 ]; then
    log "iteration $i: codex exited rc=$rc (see $iter_log)."
  fi

  # --- Loop-side commit (codex's sandbox blocks .git writes) ---
  after_done_ids="$(jq -r '.tasks[]|select(.status=="done")|.id' "$PRD_FILE" 2>/dev/null | sort)"
  newly="$(comm -13 <(printf '%s\n' "$before_done_ids") <(printf '%s\n' "$after_done_ids") | grep -v '^$' | paste -sd, -)"
  changed="$(git status --porcelain | wc -l | tr -d ' ')"

  if [ -n "$newly" ] && [ "$changed" -gt 0 ]; then
    log "iteration $i: codex marked done: $newly — re-running gate before commit…"
    if bun run test >>"$iter_log" 2>&1 && bun run check >>"$iter_log" 2>&1 && bun run prepack >>"$iter_log" 2>&1; then
      git add -A
      git commit -q -m "feat(engine): $newly (ralph iter $i)" \
        -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
      consec_fail=0
      log "iteration $i: COMMITTED — $(git --no-pager log --oneline -1)"
    else
      consec_fail=$((consec_fail + 1))
      log "iteration $i: GATE RED after codex claimed done '$newly' — discarding this iteration for a clean retry (consec_fail=$consec_fail; see $iter_log)."
      recover_iteration
    fi
  elif [ "$changed" -gt 0 ]; then
    consec_fail=$((consec_fail + 1))
    log "iteration $i: tree changed but no task newly marked done (consec_fail=$consec_fail) — leaving partial work for next iteration."
  else
    consec_fail=$((consec_fail + 1))
    log "iteration $i: no changes produced (consec_fail=$consec_fail)."
  fi

  if [ -f "$last_msg" ] && grep -q "$SENTINEL" "$last_msg" 2>/dev/null && [ "$(required_remaining)" = "0" ]; then
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
