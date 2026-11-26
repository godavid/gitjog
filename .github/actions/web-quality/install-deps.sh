#!/usr/bin/env bash
# web-quality: Playwright OS packages and the Chromium download, called by action.yml in the action dir.
#
# `playwright install --with-deps` fails on a runner whose apt index is stale or caught in a mirror sync
# (`Hash Sum mismatch`, `404 Not Found`, exit code 100). One retry after a fresh apt index clears it; a second
# failure is a runner infrastructure error and says so. The browser download runs after the OS packages.
#
# Env (all optional, mostly for the unit test):
#   WQ_PLAYWRIGHT          playwright binary (default ./node_modules/.bin/playwright)
#   WQ_OS                  operating system name (default `uname -s`)
#   WQ_APT_RETRY_DELAY     seconds to wait before the retry (default 5)
#   WQ_APT_LISTS_DIR       apt index directory that the retry clears (default /var/lib/apt/lists)
#   GITHUB_STEP_SUMMARY    when set, the infrastructure error is also written there
set -euo pipefail

PW="${WQ_PLAYWRIGHT:-./node_modules/.bin/playwright}"
DELAY="${WQ_APT_RETRY_DELAY:-5}"
LISTS="${WQ_APT_LISTS_DIR:-/var/lib/apt/lists}"

# Off Linux, or on Linux without apt-get, playwright decides itself what --with-deps does.
if [ "${WQ_OS:-$(uname -s)}" != Linux ] || ! command -v apt-get >/dev/null 2>&1; then
  "$PW" install --with-deps chromium
  exit 0
fi

refresh_apt_index() {
  local priv=()
  if [ "$(id -u)" != 0 ]; then
    if command -v sudo >/dev/null 2>&1; then
      priv=(sudo -n)
    else
      echo "::warning::web-quality: not root and no sudo: the apt index is not refreshed, the retry uses it as it is"
      return 0
    fi
  fi
  ${priv[@]+"${priv[@]}"} apt-get clean || true
  ${priv[@]+"${priv[@]}"} find "$LISTS/partial" -mindepth 1 -delete 2>/dev/null || true
  ${priv[@]+"${priv[@]}"} find "$LISTS" -maxdepth 1 -type f ! -name lock -delete 2>/dev/null || true
  ${priv[@]+"${priv[@]}"} apt-get update || echo "::warning::web-quality: apt-get update failed"
}

if ! "$PW" install-deps chromium; then
  echo "::warning::web-quality: installing the Playwright OS packages failed; the runner apt index may be stale or in a mirror sync. Refreshing it and retrying once in ${DELAY}s"
  sleep "$DELAY"
  refresh_apt_index
  if ! "$PW" install-deps chromium; then
    msg="web-quality: runner apt index: installing the Playwright OS packages failed twice (stale apt index or mirror sync: Hash Sum mismatch / 404); this is most likely a runner infrastructure error, not an a11y or visual result (the apt output above says which). Rerun the job; if it repeats, refresh the runner image (boss ci-runners)."
    echo "::error::$msg"
    if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then printf '%s\n' "$msg" >>"$GITHUB_STEP_SUMMARY"; fi
    exit 1
  fi
fi

"$PW" install chromium
