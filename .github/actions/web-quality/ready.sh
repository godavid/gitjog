# Readiness polling of web-quality, sourced by run.sh (and by ready.test.mjs). No side effects when sourced.
# Ready means 2xx. A 3xx answer is not ready: an app that redirects to a setup or login page is not serving yet.

# wq_probe <url> [max-time]: sets WQ_CODE (000 when nothing answered) and WQ_LOCATION (the redirect target, else empty).
# max-time is the whole request in seconds (default 5). A refused connection returns at once whatever it is.
wq_probe() {
  local out
  out="$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --connect-timeout 5 --max-time "${2:-5}" "$1" 2>/dev/null || true)"
  WQ_CODE="${out%% *}"
  WQ_LOCATION=""
  [ "$out" = "$WQ_CODE" ] || WQ_LOCATION="${out#* }"
  [ -n "$WQ_CODE" ] || WQ_CODE=000
}

# wq_wait_ready <url> <timeout-seconds> <server-pid>: returns 0 once the url answers 2xx.
# Otherwise returns 1 and sets WQ_READY_ERROR (the server process exited, or the timeout ran out).
# Each probe may last until the deadline, so once the server accepts the connection exactly one request is in
# flight and the probe waits for its answer. A first request that takes minutes (a fresh local database with
# migration and seed) must not be abandoned and repeated: every abandoned request queues behind the slow one.
wq_wait_ready() {
  local url="$1" timeout="$2" pid="$3" deadline left
  WQ_READY_ERROR=""
  WQ_CODE=000
  WQ_LOCATION=""
  deadline=$((SECONDS + timeout))
  while :; do
    left=$((deadline - SECONDS))
    [ "$left" -ge 1 ] || left=1
    wq_probe "$url" "$left"
    case "$WQ_CODE" in
      2??) return 0 ;;
    esac
    if ! kill -0 "$pid" 2>/dev/null; then
      WQ_READY_ERROR="start-command exited before $url became ready (it must stay in the foreground)"
      return 1
    fi
    if [ "$SECONDS" -ge "$deadline" ]; then
      case "$WQ_CODE" in
        3??) WQ_READY_ERROR="ready-url answered $WQ_CODE (Location: ${WQ_LOCATION:-none}) until the timeout; point ready-url at a page that answers 2xx when the app is ready" ;;
        *) WQ_READY_ERROR="$url not ready within ${timeout}s (last answer: $WQ_CODE)" ;;
      esac
      return 1
    fi
    sleep 1
  done
}
