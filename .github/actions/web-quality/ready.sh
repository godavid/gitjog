# Readiness polling of web-quality, sourced by run.sh (and by ready.test.mjs). No side effects when sourced.
# Ready means 2xx. A 3xx answer is not ready: an app that redirects to a setup or login page is not serving yet.

# wq_probe <url>: sets WQ_CODE (000 when nothing answered) and WQ_LOCATION (the redirect target, else empty).
wq_probe() {
  local out
  out="$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 5 "$1" 2>/dev/null || true)"
  WQ_CODE="${out%% *}"
  WQ_LOCATION=""
  [ "$out" = "$WQ_CODE" ] || WQ_LOCATION="${out#* }"
  [ -n "$WQ_CODE" ] || WQ_CODE=000
}

# wq_wait_ready <url> <timeout-seconds> <server-pid>: returns 0 once the url answers 2xx.
# Otherwise returns 1 and sets WQ_READY_ERROR (the server process exited, or the timeout ran out).
wq_wait_ready() {
  local url="$1" timeout="$2" pid="$3" deadline
  WQ_READY_ERROR=""
  WQ_CODE=000
  WQ_LOCATION=""
  deadline=$((SECONDS + timeout))
  while :; do
    wq_probe "$url"
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
