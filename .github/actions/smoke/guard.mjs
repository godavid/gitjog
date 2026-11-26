// Built-in prod guard of actions/smoke.
//
// Installed on every browser context. It aborts
//   - analytics and error-reporting beacons (any method; includes Cloudflare Web Analytics:
//     `cloudflareinsights.com` hosts and the `/cdn-cgi/rum` path on any origin),
//   - the analytics and Sentry tunnels that the product serves on its own origin (paths in
//     PROD_GUARD_TUNNEL_PATHS or `prodGuard.tunnelPaths`, default "/monitoring,/ingest"), any
//     method, only on the origin under test and the extra origins (same rule as
//     templates/prod-guard.ts, reason `analytics-or-sentry-tunnel`), and
//   - every request that is not GET/HEAD to the origin under test, to the configured
//     extra origins and to Supabase `rest/v1` and `functions/v1`
//     (except POST `rest/v1/rpc/<name>` with <name> in `readOnlyRpc`).
// Every abort is logged in `log.aborted`. `log.unabortedWrites` is computed from the
// browser's own `request` events, independently of the route handler, so a hole in the
// handler shows up as a non-zero count. Logged URLs are origin + path only (no query
// string, no fragment), so analytics parameters and tokens never reach the reports.

const ANALYTICS_HOST_SUFFIXES = [
  'googletagmanager.com',
  'google-analytics.com',
  'analytics.google.com',
  'doubleclick.net',
  'vitals.vercel-insights.com',
  'sentry.io',
  'cloudflareinsights.com',
];
const ANALYTICS_HOST_PARTS = ['posthog'];
// `/cdn-cgi/rum` is the Cloudflare Web Analytics beacon path; Cloudflare serves it on the
// site's own origin, so it is matched on any origin.
const ANALYTICS_PATH_PREFIXES = ['/_vercel/insights', '/_vercel/speed-insights', '/cdn-cgi/rum'];

// Must equal DEFAULT_TUNNEL_PATHS of templates/prod-guard.ts (guard.test.mjs compares them).
export const DEFAULT_TUNNEL_PATHS = '/monitoring,/ingest';

/**
 * Normalises a comma list (string) or an array of tunnel paths like templates/prod-guard.ts:
 * "monitoring/" and "/monitoring" both become "/monitoring"; "/" and "" are dropped (they
 * would match everything). An empty list disables the tunnel rule.
 */
export function tunnelPathsOf(value) {
  const parts = Array.isArray(value) ? value : String(value ?? '').split(',');
  return parts
    .map((part) => String(part).trim())
    .filter(Boolean)
    .map((part) => `/${part.replace(/^\/+|\/+$/g, '')}`)
    .filter((part) => part !== '/');
}

/**
 * Config value (`prodGuard.tunnelPaths`) wins over the env value (PROD_GUARD_TUNNEL_PATHS);
 * either one REPLACES the default list, and an empty one disables the rule.
 */
export function resolveTunnelPaths(configValue, envValue) {
  if (configValue !== undefined) return tunnelPathsOf(configValue);
  return tunnelPathsOf(envValue ?? DEFAULT_TUNNEL_PATHS);
}

const URL_NOT_SHOWN = '(value not shown: the host could not be read)';

/**
 * A URL as error messages may show it: scheme and host (with port) only. Userinfo, path, query and
 * fragment can hold secrets and never reach a message, the report, the step summary or an annotation.
 * The authority ends at the first / ? # \ (WHATWG), so an unescaped one inside a userinfo makes the part
 * before it the "host": when an @ follows that cut, the host may be userinfo and nothing is shown. When no
 * host can be read, the same fixed text stands in for the whole value.
 */
export function describeUrl(value) {
  const rest = String(value ?? '').replace(/^[a-z][a-z0-9+.-]*:[/\\]*/i, '');
  const cut = rest.search(/[/?#\\]/);
  if (cut >= 0 && rest.slice(cut).includes('@')) return URL_NOT_SHOWN;
  try {
    const url = new URL(value);
    if (url.host) return JSON.stringify(`${url.protocol}//${url.host}`);
  } catch {
    // fall through: nothing of the value is shown
  }
  return URL_NOT_SHOWN;
}

export function normalizeOrigin(value, what) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${what}: not a valid URL: ${describeUrl(value)}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${what}: only http(s) is allowed: ${describeUrl(value)}`);
  }
  return url.origin;
}

function hostMatches(host, suffix) {
  return host === suffix || host.endsWith(`.${suffix}`);
}

export function isAnalytics(url) {
  const host = url.hostname.toLowerCase();
  if (ANALYTICS_HOST_SUFFIXES.some((s) => hostMatches(host, s))) return true;
  if (ANALYTICS_HOST_PARTS.some((p) => host.includes(p))) return true;
  return ANALYTICS_PATH_PREFIXES.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`));
}

/** Pure classifier shared by the route handler and the independent counter. */
export function makeClassifier({ origin, extraOrigins = [], readOnlyRpc = [], tunnelPaths = tunnelPathsOf(DEFAULT_TUNNEL_PATHS) }) {
  const guardedOrigins = new Set([origin, ...extraOrigins]);
  const tunnels = tunnelPathsOf(tunnelPaths);
  const rpcAllow = new Set(readOnlyRpc);
  const supabaseHost = /^[a-z0-9-]+\.supabase\.co$/i;

  function isGuardedTarget(url) {
    if (guardedOrigins.has(url.origin)) return true;
    return (
      supabaseHost.test(url.hostname) &&
      (url.pathname.startsWith('/rest/v1/') || url.pathname.startsWith('/functions/v1/'))
    );
  }

  function isTunnel(url) {
    return (
      guardedOrigins.has(url.origin) && tunnels.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`))
    );
  }

  function isAllowedRpc(url, method) {
    if (method !== 'POST') return false;
    const m = /^\/rest\/v1\/rpc\/([^/]+)\/?$/.exec(url.pathname);
    return Boolean(m) && supabaseHost.test(url.hostname) && rpcAllow.has(decodeURIComponent(m[1]));
  }

  /** Returns `{ abort: boolean, reason?: string }`. */
  function decide(urlString, methodRaw) {
    let url;
    try {
      url = new URL(urlString);
    } catch {
      return { abort: false };
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return { abort: false };
    const method = String(methodRaw).toUpperCase();
    if (isAnalytics(url)) return { abort: true, reason: 'analytics' };
    if (isTunnel(url)) return { abort: true, reason: 'analytics-or-sentry-tunnel' };
    if (method === 'GET' || method === 'HEAD') return { abort: false };
    if (!isGuardedTarget(url)) return { abort: false };
    if (isAllowedRpc(url, method)) return { abort: false, allowedRpc: true };
    return { abort: true, reason: 'write' };
  }

  /** True for a non-GET/HEAD request that the guard must abort (write or analytics beacon). */
  function isWrite(urlString, methodRaw) {
    const method = String(methodRaw).toUpperCase();
    return method !== 'GET' && method !== 'HEAD' && decide(urlString, method).abort === true;
  }

  return { decide, isWrite };
}

/** URL without query string and fragment (origin + path): safe to log, like templates/prod-guard.ts. */
export function redactUrl(value) {
  try {
    const url = new URL(value);
    return url.origin + url.pathname;
  } catch {
    return String(value).split(/[?#]/)[0];
  }
}

export function newGuardLog() {
  return { aborted: [], allowedRpc: [], unabortedWrites: 0, ignoredConsoleErrors: 0 };
}

/**
 * Installs the guard on `context`. `scope` ({page, viewport}) is stored with every
 * logged request. Returns `{ abortedUrls, finish }`; call `finish()` after the page is
 * done to add this context's unaborted writes to the log.
 */
export async function installGuard(context, classifier, log, scope) {
  const abortedRequests = new Set();
  const abortedUrls = new Set();
  const seenWrites = [];

  context.on('request', (request) => {
    if (classifier.isWrite(request.url(), request.method())) seenWrites.push(request);
  });

  await context.route('**/*', async (route) => {
    const request = route.request();
    const decision = classifier.decide(request.url(), request.method());
    if (decision.abort) {
      abortedRequests.add(request);
      abortedUrls.add(request.url());
      log.aborted.push({
        method: request.method(),
        url: redactUrl(request.url()),
        reason: decision.reason,
        page: scope.page,
        viewport: scope.viewport,
      });
      await route.abort('blockedbyclient');
      return;
    }
    if (decision.allowedRpc) {
      log.allowedRpc.push({ method: request.method(), url: redactUrl(request.url()), page: scope.page, viewport: scope.viewport });
    }
    await route.continue();
  });

  return {
    abortedUrls,
    finish() {
      log.unabortedWrites += seenWrites.filter((r) => !abortedRequests.has(r)).length;
    },
  };
}
