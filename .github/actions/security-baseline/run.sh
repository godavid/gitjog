#!/usr/bin/env bash
# Runs actionlint and zizmor on the caller's workflows, then merges the results
# with check.py. Called by action.yml; also runnable locally:
#   ACTIONLINT_BIN=/path/actionlint ZIZMOR_BIN=/path/zizmor \
#     bash run.sh <path> <allow-file> <report-file>
# Run it from the repository root (a git checkout: actionlint needs one). actionlint
# reads `.github/actionlint.yaml` (or .yml) of the repository root; run.sh passes it
# explicitly with -config-file, so it applies for any `path` (see docs).
set -euo pipefail

work=""
# Whatever goes wrong (tool failure, unexpected error), `result` is written and the step fails.
# check.py writes the real result itself (exit 0 or 1); any other exit means it did not.
result_written=0
# shellcheck disable=SC2329 # invoked by the EXIT trap
on_exit() {
  local rc=$?
  [ -z "$work" ] || rm -rf "$work"
  if [ "$rc" -ne 0 ] && [ "$result_written" -ne 1 ]; then
    if [ -n "${GITHUB_OUTPUT:-}" ]; then
      printf 'result=error\nblocking=0\n' >> "$GITHUB_OUTPUT"
    fi
    echo "::error::security-baseline: stopped with an error before a result was produced (exit code $rc)."
  fi
}
trap on_exit EXIT

path="${1:-.github/workflows}"
allow_file="${2:-.monitoring/security-baseline-allow.yml}"
report="${3:-security-baseline-report.json}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
actionlint_bin="${ACTIONLINT_BIN:?ACTIONLINT_BIN is required}"
zizmor_bin="${ZIZMOR_BIN:?ZIZMOR_BIN is required}"

work="$(mktemp -d)"

if [ ! -e "$path" ]; then
  echo "::error::security-baseline: path '$path' does not exist in the checkout."
  exit 1
fi

# Workflow files for actionlint (it lints workflow files only, not action.yml).
files=()
if [ -d "$path" ]; then
  while IFS= read -r -d '' f; do files+=("$f"); done < <(find "$path" -type f \( -name '*.yml' -o -name '*.yaml' \) -print0 | sort -z)
else
  files+=("$path")
fi

# actionlint config: `.github/actionlint.yaml|yml` of the repository root (the current
# directory). actionlint finds it by itself only for a project (a git root that has
# `.github/workflows`); passing it makes a non-default `path` safe too.
config_args=()
for candidate in .github/actionlint.yaml .github/actionlint.yml; do
  if [ -f "$candidate" ]; then
    config_args=(-config-file "$candidate")
    break
  fi
done

# actionlint: exit 0 = clean, 1 = errors found (both fine); anything else is a tool failure.
echo '[]' > "$work/actionlint.json"
if [ "${#files[@]}" -gt 0 ]; then
  rc=0
  "$actionlint_bin" ${config_args[@]+"${config_args[@]}"} -shellcheck= -pyflakes= -format '{{json .}}' "${files[@]}" > "$work/actionlint.json" || rc=$?
  if [ "$rc" -ne 0 ] && [ "$rc" -ne 1 ]; then
    echo "::error::security-baseline: actionlint failed with exit code $rc (tool failure, not a finding)."
    exit 1
  fi
else
  echo "::warning::security-baseline: no workflow files found under '$path'."
fi

# zizmor config: every external `uses:` must be pinned to a full commit SHA. The audit
# `self-repository` (a Low "use GitHub's dedicated self-repository syntax" warning for every
# `./` local `uses:`) is off: a local action path is the normal form.
cat > "$work/zizmor.yml" <<'YAML'
rules:
  unpinned-uses:
    config:
      policies:
        "*": hash-pin
  self-repository:
    disable: true
YAML
# Composite actions live next to the workflows directory (.github/actions for the default path).
inputs=("$path")
if [ -d "$path" ] && [ "$(basename "$path")" = "workflows" ] && [ -d "$path/../actions" ]; then
  inputs+=("$path/../actions")
fi
# Exit codes: 0 = no findings, 10-14 = findings by severity; anything else is a tool failure.
# --no-ignores: inline `# zizmor: ignore` comments are not an exception path; only the allow-file is.
rc=0
"$zizmor_bin" --format json --no-online-audits --persona regular --no-progress \
  --no-ignores --config "$work/zizmor.yml" "${inputs[@]}" > "$work/zizmor.json" 2> "$work/zizmor.err" || rc=$?
if [ "$rc" -ne 0 ] && { [ "$rc" -lt 10 ] || [ "$rc" -gt 14 ]; }; then
  cat "$work/zizmor.err" >&2
  echo "::error::security-baseline: zizmor failed with exit code $rc (tool failure, not a finding)."
  exit 1
fi

check_rc=0
python3 -I "$here/check.py" --root . --path "$path" --allow-file "$allow_file" \
  --actionlint-json "$work/actionlint.json" --zizmor-json "$work/zizmor.json" \
  --report "$report" || check_rc=$?
if [ "$check_rc" -eq 0 ] || [ "$check_rc" -eq 1 ]; then result_written=1; fi
exit "$check_rc"
