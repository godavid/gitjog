#!/usr/bin/env bash
# web-quality: start the app server, run the Playwright a11y and visual tests, always stop the server.
# Called by action.yml (one `run` step). All inputs arrive through env; nothing is interpolated here.
#
# Env (all WQ_* are set by action.yml; RUNNER_NAME is the GitHub runner name):
#   WQ_CONFIG WQ_A11Y_BASELINE WQ_SNAPSHOTS_DIR      files and dirs, relative to the current dir
#   WQ_START_COMMAND WQ_READY_URL WQ_READY_TIMEOUT   server started by this script (own process group)
#   WQ_BASE_URL                                      test an already running URL instead (no server)
#   WQ_A11Y WQ_VISUAL                                true | false | off (kill switch); empty means true
#   WQ_VISUAL_RUNNER_PREFIX                          visual runs only when RUNNER_NAME starts with it ('' = any)
#   WQ_REPORT_DIR WQ_REPORT_NAME WQ_MARKER_DIR       output locations
#   WQ_MAX_DIFF_PIXEL_RATIO                          default 0.01
# a11y baseline matching (versions 1 and 2): a11y-match.mjs, shared with quality.spec.mjs.
# Writes to $GITHUB_OUTPUT: result, a11y, visual, report-dir. Exit 1 when the result is failed.
# Snapshots are never updated: this script never passes --update-snapshots.
set -euo pipefail

ACTION_DIR="${GITHUB_ACTION_PATH:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
GH_OUT="${GITHUB_OUTPUT:-/dev/null}"
RESULT=failed
A11Y_RESULT=failed
VISUAL_RESULT=failed
SERVER_PID=""

log() { printf 'web-quality: %s\n' "$*"; }
warn() { printf '::warning::web-quality: %s\n' "$*"; }
fail() { printf '::error::web-quality: %s\n' "$*"; exit 1; }

lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

# Resolve a path against the current directory (the caller's workspace).
abspath() {
  case "$1" in
    /*) printf '%s' "$1" ;;
    *) printf '%s/%s' "$PWD" "${1#./}" ;;
  esac
}

stop_server() {
  [ -n "$SERVER_PID" ] || return 0
  local pgid="$SERVER_PID"
  SERVER_PID=""
  kill -TERM -- "-$pgid" 2>/dev/null || true
  for _ in $(seq 1 50); do
    kill -0 -- "-$pgid" 2>/dev/null || break
    sleep 0.1
  done
  kill -KILL -- "-$pgid" 2>/dev/null || true
  wait "$pgid" 2>/dev/null || true
  log "server process group $pgid stopped"
}

on_exit() {
  local rc=$?
  trap - EXIT
  stop_server
  {
    printf 'result=%s\n' "$RESULT"
    printf 'a11y=%s\n' "$A11Y_RESULT"
    printf 'visual=%s\n' "$VISUAL_RESULT"
    printf 'report-dir=%s\n' "${WQ_REPORT_DIR:-}"
  } >>"$GH_OUT"
  exit "$rc"
}
trap on_exit EXIT
trap 'exit 143' TERM INT

# Normalise a kill-switch value into the global SWITCH ("true" or "false"); unknown values are an error.
switch_value() {
  local name="$1" raw
  raw="$(lower "${2:-}")"
  case "$raw" in
    ''|true) SWITCH=true ;;
    false|off) SWITCH=false ;;
    *) fail "input $name must be true, false or off (got '$2')" ;;
  esac
}

write_marker() { # <a11y|visual>
  [ -n "${WQ_MARKER_DIR:-}" ] || return 0
  mkdir -p "$WQ_MARKER_DIR"
  printf 'skipped\n' >"$WQ_MARKER_DIR/$1"
}

summary() {
  [ -n "${GITHUB_STEP_SUMMARY:-}" ] || return 0
  printf '%s\n' "$*" >>"$GITHUB_STEP_SUMMARY"
}

# ---- inputs ----------------------------------------------------------------
: "${WQ_CONFIG:?}" "${WQ_A11Y_BASELINE:?}" "${WQ_SNAPSHOTS_DIR:?}" "${WQ_REPORT_DIR:?}"
REPORT_NAME="${WQ_REPORT_NAME:-web-quality-report}"
case "$REPORT_NAME" in
  ''|*[!A-Za-z0-9._-]*|.|..) fail "report-name may only contain letters, digits, '.', '_' and '-'" ;;
esac
RATIO="${WQ_MAX_DIFF_PIXEL_RATIO:-0.01}"
printf '%s' "$RATIO" | grep -Eq '^(0(\.[0-9]+)?|1(\.0+)?)$' || fail "max-diff-pixel-ratio must be a number from 0 to 1 (got '$RATIO')"
READY_TIMEOUT="${WQ_READY_TIMEOUT:-120}"
printf '%s' "$READY_TIMEOUT" | grep -Eq '^[1-9][0-9]{0,4}$' || fail "ready-timeout-seconds must be a positive integer"

SWITCH=true
switch_value a11y "${WQ_A11Y:-}"
WANT_A11Y="$SWITCH"
switch_value visual "${WQ_VISUAL:-}"
WANT_VISUAL="$SWITCH"

[ "$(basename "$WQ_REPORT_DIR")" = "$REPORT_NAME" ] || fail "report dir must end with the report name"
[ -z "${WQ_MARKER_DIR:-}" ] || [ "$(basename "$WQ_MARKER_DIR")" = "$REPORT_NAME" ] || fail "marker dir must end with the report name"
rm -rf "$WQ_REPORT_DIR"
mkdir -p "$WQ_REPORT_DIR"
[ -z "${WQ_MARKER_DIR:-}" ] || rm -rf "$WQ_MARKER_DIR"

RUN_A11Y=false
RUN_VISUAL=false
A11Y_RESULT=skipped
VISUAL_RESULT=skipped

if [ "$WANT_A11Y" = true ]; then
  RUN_A11Y=true
  A11Y_RESULT=failed
else
  warn "a11y skipped: switched off (MONITORING_A11Y=off or input a11y=false)"
  summary "- web-quality a11y: skipped (switched off)"
  write_marker a11y
fi

if [ "$WANT_VISUAL" = true ]; then
  PREFIX="${WQ_VISUAL_RUNNER_PREFIX-ms-s1-}"
  case "${RUNNER_NAME:-}" in
    "$PREFIX"*)
      RUN_VISUAL=true
      VISUAL_RESULT=failed
      ;;
    *)
      warn "visual skipped: runner '${RUNNER_NAME:-}' does not start with '$PREFIX' (baselines are runner-specific; input visual-runner-prefix)"
      summary "- web-quality visual: skipped (runner '${RUNNER_NAME:-}' does not start with '$PREFIX')"
      write_marker visual
      ;;
  esac
else
  warn "visual skipped: switched off (MONITORING_VISUAL=off or input visual=false)"
  summary "- web-quality visual: skipped (switched off)"
  write_marker visual
fi

if [ "$RUN_A11Y" = false ] && [ "$RUN_VISUAL" = false ]; then
  RESULT=skipped
  log "nothing to run"
  exit 0
fi

CONFIG_FILE="$(abspath "$WQ_CONFIG")"
[ -f "$CONFIG_FILE" ] || fail "quality config not found: $WQ_CONFIG"
BASELINE_FILE="$(abspath "$WQ_A11Y_BASELINE")"
SNAPSHOTS_DIR="$(abspath "$WQ_SNAPSHOTS_DIR")"
[ -x "$ACTION_DIR/node_modules/.bin/playwright" ] || fail "dependencies missing: run 'npm ci --ignore-scripts' in $ACTION_DIR"

# ---- server ----------------------------------------------------------------
START_COMMAND="${WQ_START_COMMAND:-}"
BASE_URL="${WQ_BASE_URL:-}"
if [ -n "$START_COMMAND" ] && [ -n "$BASE_URL" ]; then
  fail "give either start-command (with ready-url) or base-url, not both"
fi
if [ -z "$START_COMMAND" ] && [ -z "$BASE_URL" ]; then
  fail "start-command (with ready-url) or base-url is required"
fi

if [ -n "$BASE_URL" ]; then
  printf '%s' "$BASE_URL" | grep -Eq '^https?://[^/[:space:]]+' || fail "base-url must start with http:// or https://"
  BASE_URL="$(printf '%s' "$BASE_URL" | sed -E 's#^(https?://[^/]+).*#\1#')"
else
  READY_URL="${WQ_READY_URL:-}"
  [ -n "$READY_URL" ] || fail "ready-url is required with start-command"
  printf '%s' "$READY_URL" | grep -Eq '^https?://[^/[:space:]]+' || fail "ready-url must start with http:// or https://"
  BASE_URL="$(printf '%s' "$READY_URL" | sed -E 's#^(https?://[^/]+).*#\1#')"

  http_code() { curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$1" 2>/dev/null || true; }

  case "$(http_code "$READY_URL")" in
    2??|3??) fail "ready-url already answers before start-command ran (port in use or stale server); refusing to test an unknown server" ;;
  esac

  SERVER_LOG="$WQ_REPORT_DIR/server.log"
  : >"$SERVER_LOG"
  log "starting server: $START_COMMAND"
  # Own session and process group: pgid == pid, so the whole tree can be killed at the end.
  if command -v setsid >/dev/null 2>&1; then
    setsid bash -c "$START_COMMAND" </dev/null >>"$SERVER_LOG" 2>&1 &
  else
    python3 -c 'import os, sys; os.setsid(); os.execvp("bash", ["bash", "-c", sys.argv[1]])' "$START_COMMAND" </dev/null >>"$SERVER_LOG" 2>&1 &
  fi
  SERVER_PID=$!

  deadline=$((SECONDS + READY_TIMEOUT))
  while :; do
    case "$(http_code "$READY_URL")" in
      2??|3??) break ;;
    esac
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
      tail -n 40 "$SERVER_LOG" || true
      fail "start-command exited before $READY_URL became ready (it must stay in the foreground)"
    fi
    if [ "$SECONDS" -ge "$deadline" ]; then
      tail -n 40 "$SERVER_LOG" || true
      fail "$READY_URL not ready within ${READY_TIMEOUT}s"
    fi
    sleep 1
  done
  log "server ready at $READY_URL"
fi

# ---- tests -----------------------------------------------------------------
export WQ_BASE_URL="$BASE_URL" WQ_CONFIG="$CONFIG_FILE" WQ_A11Y_BASELINE="$BASELINE_FILE"
export WQ_SNAPSHOTS_DIR="$SNAPSHOTS_DIR" WQ_REPORT_DIR WQ_MAX_DIFF_PIXEL_RATIO="$RATIO"
export WQ_RUN_A11Y="$RUN_A11Y" WQ_RUN_VISUAL="$RUN_VISUAL" WQ_ACTION_DIR="$ACTION_DIR"
export WQ_WORKERS="${DEV_BUDGET_WORKERS:-${WQ_WORKERS:-2}}"
unset PLAYWRIGHT_JSON_OUTPUT_NAME || true

PW_RC=0
"$ACTION_DIR/node_modules/.bin/playwright" test --config "$ACTION_DIR/playwright.config.mjs" || PW_RC=$?
log "playwright exit code $PW_RC"
stop_server

# ---- evaluate (a11y merge, stale baseline, visual failures) ----------------------
STATUS_FILE="$WQ_REPORT_DIR/status.env"
rm -f "$STATUS_FILE"
node --input-type=module - "$STATUS_FILE" <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const statusFile = process.argv[2];
const reportDir = process.env.WQ_REPORT_DIR;
const runA11y = process.env.WQ_RUN_A11Y === 'true';
const runVisual = process.env.WQ_RUN_VISUAL === 'true';
const quality = JSON.parse(fs.readFileSync(process.env.WQ_CONFIG, 'utf8'));
const viewports = quality.viewports || ['mobile', 'desktop'];
const expected = quality.pages.length * viewports.length;
const { currentDocument, loadBaseline, matchFindings } = await import(pathToFileURL(path.join(process.env.WQ_ACTION_DIR, 'a11y-match.mjs')).href);
const esc = (s) => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const plain = (s) => String(s || '').replace(/\u001b\[[0-9;]*m/g, '');
const lines = [];
const out = (line) => process.stdout.write(`${line}\n`);

// Playwright JSON report -> per category counts.
const tests = [];
try {
  const walk = (suite) => {
    for (const spec of suite.specs || []) {
      for (const t of spec.tests || []) {
        const last = (t.results || [])[(t.results || []).length - 1] || {};
        const err = last.error || (last.errors || [])[0] || {};
        tests.push({ title: spec.title, project: t.projectName, status: t.status, message: plain(err.message).replace(/^Error: /, '').split('\n')[0], detail: (plain(err.message).match(/\d+ pixels? \(ratio [\d.]+ of all image pixels\) are different/) || [''])[0] });
      }
    }
    for (const child of suite.suites || []) walk(child);
  };
  const report = JSON.parse(fs.readFileSync(path.join(reportDir, 'results.json'), 'utf8'));
  for (const suite of report.suites || []) walk(suite);
} catch (error) {
  out(`::error::web-quality: no usable Playwright JSON report (${esc(error.message)})`);
}
const ofKind = (kind) => tests.filter((t) => t.title.startsWith(`${kind}: `));
const passedCount = (kind) => ofKind(kind).filter((t) => t.status === 'expected').length;

const status = { a11y: 'skipped', visual: 'skipped' };
const md = ['### web-quality'];

if (runA11y) {
  const dir = path.join(reportDir, 'a11y');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort() : [];
  const current = [];
  const fresh = [];
  for (const name of files) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    current.push(...data.findings);
    fresh.push(...data.new);
  }
  fs.writeFileSync(path.join(reportDir, 'a11y-current.json'), `${JSON.stringify(currentDocument(current), null, 2)}\n`);
  for (const f of fresh) {
    out(`::error::web-quality a11y: new finding ${esc(f.rule)} at "${esc(f.target)}" on ${esc(f.path)} (${f.viewport}): ${esc(f.help)} [${esc(f.impact)}]`);
  }
  for (const t of ofKind('a11y').filter((x) => x.status !== 'expected')) {
    if (fresh.length === 0 || !/new a11y findings/.test(t.message)) {
      out(`::error::web-quality ${esc(t.title)} (${t.project}) failed: ${esc(t.message)}`);
    }
  }
  let stale = [];
  if (files.length === expected) {
    stale = matchFindings(loadBaseline(process.env.WQ_A11Y_BASELINE), current).stale;
    for (const f of stale) {
      out(`::warning::web-quality a11y: stale baseline entry ${esc(f.rule)} at "${esc(f.target || f.html)}" on ${esc(f.path)} (${esc(f.viewport)}) no longer found; remove it from the baseline`);
    }
  } else {
    out('::warning::web-quality a11y: not every page and viewport was checked, stale baseline check skipped');
  }
  const ok = passedCount('a11y') === expected && fresh.length === 0;
  status.a11y = ok ? 'passed' : 'failed';
  md.push(`- a11y: **${status.a11y}** (${current.length} findings in total, ${fresh.length} new, ${stale.length} stale baseline entries)`);
  for (const f of fresh.slice(0, 50)) md.push(`  - new: \`${f.rule}\` \`${f.target}\` ${f.path} (${f.viewport}): ${f.help}`);
  for (const f of stale.slice(0, 50)) md.push(`  - stale: \`${f.rule}\` \`${f.target || f.html}\` ${f.path} (${f.viewport})`);
}

if (runVisual) {
  const bad = ofKind('visual').filter((t) => t.status !== 'expected');
  for (const t of bad) {
    const name = `${t.title.replace(/^visual: /, '')}-${t.project}`;
    out(`::error::web-quality visual: ${esc(name)} failed: ${esc(t.message)}${t.detail ? `, ${esc(t.detail)}` : ''}${/snapshot doesn't exist|toHaveScreenshot/.test(t.message) ? ` (see ${esc(name)}-actual.png in the report artifact)` : ''}`);
  }
  const ok = passedCount('visual') === expected;
  status.visual = ok ? 'passed' : 'failed';
  md.push(`- visual: **${status.visual}** (${passedCount('visual')} of ${expected} screenshots match)`);
  for (const t of bad.slice(0, 50)) md.push(`  - ${t.title.replace(/^visual: /, '')}-${t.project}: ${t.message}${t.detail ? `, ${t.detail}` : ''}`);
}

if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md.join('\n')}\n`);
fs.writeFileSync(statusFile, `a11y=${status.a11y}\nvisual=${status.visual}\n`);
NODE

read_status() { sed -n "s/^$1=//p" "$STATUS_FILE" 2>/dev/null | head -n 1; }
if [ -f "$STATUS_FILE" ]; then
  if [ "$RUN_A11Y" = true ]; then A11Y_RESULT="$(read_status a11y)"; fi
  if [ "$RUN_VISUAL" = true ]; then VISUAL_RESULT="$(read_status visual)"; fi
fi

if [ "$A11Y_RESULT" != passed ] && [ "$A11Y_RESULT" != skipped ]; then A11Y_RESULT=failed; fi
if [ "$VISUAL_RESULT" != passed ] && [ "$VISUAL_RESULT" != skipped ]; then VISUAL_RESULT=failed; fi

if [ "$A11Y_RESULT" = failed ] || [ "$VISUAL_RESULT" = failed ]; then
  RESULT=failed
  log "result failed (a11y=$A11Y_RESULT visual=$VISUAL_RESULT)"
  exit 1
fi
RESULT=passed
log "result passed (a11y=$A11Y_RESULT visual=$VISUAL_RESULT)"
