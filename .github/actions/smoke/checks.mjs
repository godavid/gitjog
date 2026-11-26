// Pure parts of the smoke runner (no Playwright, no file system, no process state), so
// checks.test.mjs can run them without main(): config parsing, error classification into
// failure kinds, text matching.
//
// Failure kinds (the `kind` of a failing check record and the `failure-kinds` output):
//   dns, connection, timeout, request (other network error), http (status, location or header
//   mismatch), content (selector or text), console, guard, config, internal.

import { describeUrl, normalizeOrigin, resolveTunnelPaths } from './guard.mjs';

export const VIEWPORTS = {
  mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false },
};

export const firstLine = (s) => String(s).split('\n')[0];

function fail(message) {
  throw new Error(message);
}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Validates a smoke config. `baseUrlInput` replaces the config's origin; `tunnelEnv` is the
 * value of PROD_GUARD_TUNNEL_PATHS (the config key wins over it).
 */
export function parseConfig(raw, { baseUrlInput = '', tunnelEnv = process.env.PROD_GUARD_TUNNEL_PATHS } = {}) {
  if (!isObject(raw)) fail('config must be a JSON object');
  if (raw.version !== 1) fail(`config.version must be 1 (got ${JSON.stringify(raw.version)})`);

  let origin;
  if (baseUrlInput) {
    const u = new URL(normalizeOrigin(baseUrlInput, 'base-url'));
    const full = new URL(baseUrlInput);
    if ((full.pathname !== '/' && full.pathname !== '') || full.search || full.hash) {
      fail(`base-url must be an origin without path, query or fragment: ${describeUrl(baseUrlInput)} has one (not shown)`);
    }
    origin = u.origin;
  } else if (typeof raw.origin === 'string' && raw.origin) {
    origin = normalizeOrigin(raw.origin, 'config.origin');
  } else {
    fail('config.origin is required when no base-url is given');
  }

  const viewports = raw.viewports ?? ['mobile', 'desktop'];
  if (!Array.isArray(viewports) || viewports.length === 0 || !viewports.every((v) => v in VIEWPORTS)) {
    fail('config.viewports must be a non-empty array of "mobile" and/or "desktop"');
  }

  const budgetOk = (v) => Number.isInteger(v) && v >= 0;
  const defaultBudget = raw.consoleErrorBudget ?? 0;
  if (!budgetOk(defaultBudget)) fail('config.consoleErrorBudget must be an integer >= 0');

  if (!Array.isArray(raw.pages) || raw.pages.length === 0) fail('config.pages must be a non-empty array');
  const pages = raw.pages.map((p, i) => {
    const where = `config.pages[${i}]`;
    if (!isObject(p)) fail(`${where} must be an object`);
    if (typeof p.path !== 'string' || !p.path.startsWith('/')) fail(`${where}.path must be a string starting with "/"`);
    const status = Array.isArray(p.status) ? p.status : [p.status ?? 200];
    if (status.length === 0 || !status.every((s) => Number.isInteger(s) && s >= 100 && s <= 599)) {
      fail(`${where}.status must be an HTTP status code or a non-empty array of them`);
    }
    for (const key of ['location', 'selector', 'text']) {
      if (p[key] !== undefined && (typeof p[key] !== 'string' || p[key] === '')) fail(`${where}.${key} must be a non-empty string`);
    }
    if (p.textIgnoreCase !== undefined && typeof p.textIgnoreCase !== 'boolean') {
      fail(`${where}.textIgnoreCase must be a boolean`);
    }
    if (p.headers !== undefined) {
      if (!isObject(p.headers) || !Object.values(p.headers).every((v) => typeof v === 'string')) {
        fail(`${where}.headers must be an object of strings`);
      }
    }
    if (p.consoleErrorBudget !== undefined && !budgetOk(p.consoleErrorBudget)) {
      fail(`${where}.consoleErrorBudget must be an integer >= 0`);
    }
    return {
      path: p.path,
      status,
      location: p.location,
      selector: p.selector,
      text: p.text,
      textIgnoreCase: p.textIgnoreCase ?? false,
      headers: p.headers ?? {},
      consoleErrorBudget: p.consoleErrorBudget ?? defaultBudget,
    };
  });

  const pg = raw.prodGuard ?? {};
  if (!isObject(pg)) fail('config.prodGuard must be an object');
  const extraOrigins = (pg.extraOrigins ?? []).map((o) => normalizeOrigin(o, 'config.prodGuard.extraOrigins'));
  const readOnlyRpc = pg.readOnlyRpc ?? [];
  if (!Array.isArray(readOnlyRpc) || !readOnlyRpc.every((n) => typeof n === 'string' && n)) {
    fail('config.prodGuard.readOnlyRpc must be an array of RPC names');
  }

  if (pg.tunnelPaths !== undefined && (!Array.isArray(pg.tunnelPaths) || !pg.tunnelPaths.every((p) => typeof p === 'string'))) {
    fail('config.prodGuard.tunnelPaths must be an array of paths (empty switches the rule off)');
  }
  const tunnelPaths = resolveTunnelPaths(pg.tunnelPaths, tunnelEnv);

  return { origin, viewports, pages, extraOrigins, readOnlyRpc, tunnelPaths };
}

/**
 * Classifies a network error into a failure kind and a message for the report:
 * dns, connection, timeout, or request (any other network error).
 */
export function classifyError(error, url) {
  const message = firstLine(error?.message ?? error);
  const host = new URL(url).hostname;
  if (/ENOTFOUND|EAI_AGAIN|ERR_NAME_NOT_RESOLVED|getaddrinfo/i.test(message)) {
    return { kind: 'dns', message: `DNS resolution failed for host "${host}": ${message}` };
  }
  if (/ECONNREFUSED|ERR_CONNECTION_REFUSED/i.test(message)) {
    return { kind: 'connection', message: `connection refused by "${host}": ${message}` };
  }
  if (/ETIMEDOUT|ERR_CONNECTION_TIMED_OUT|Timeout/i.test(message)) {
    return { kind: 'timeout', message: `timeout talking to "${host}": ${message}` };
  }
  return { kind: 'request', message: `request to "${host}" failed: ${message}` };
}

export function describeError(error, url) {
  return classifyError(error, url).message;
}

/** Sorted, unique kinds of the failing checks of a report; a record without a kind counts as internal. */
export function failureKinds(report) {
  const kinds = new Set();
  const all = [...report.checks, ...report.pages.flatMap((p) => p.checks)];
  for (const c of all) if (!c.ok) kinds.add(c.kind || 'internal');
  return [...kinds].sort();
}

/**
 * The `text` check. `innerText` is the RENDERED text, so a CSS `text-transform: uppercase` heading
 * reads as upper case; `ignoreCase` compares with toLocaleLowerCase() (no locale argument) on both sides.
 */
export function textMatches(haystack, needle, ignoreCase) {
  if (ignoreCase) return haystack.toLocaleLowerCase().includes(needle.toLocaleLowerCase());
  return haystack.includes(needle);
}

/**
 * Waits until the rendered page text (innerText, so CSS text-transform applies) contains `text`.
 * Playwright's waitForFunction bounds the whole wait, also a page whose script blocks the main
 * thread. The in-page comparison must equal textMatches() above (both are unit-tested).
 */
export async function waitForText(tab, text, ignoreCase, timeoutMs) {
  try {
    await tab.waitForFunction(
      ({ t, ic }) => {
        const body = document.body ? document.body.innerText : '';
        return ic ? body.toLocaleLowerCase().includes(t.toLocaleLowerCase()) : body.includes(t);
      },
      { t: text, ic: ignoreCase },
      { timeout: timeoutMs },
    );
    return true;
  } catch {
    return false;
  }
}

/** Default time budget of the page checks (seconds); post-deploy-smoke's job allows 10 minutes in total. */
export const DEFAULT_TIME_BUDGET_SECONDS = 300;

/**
 * Time budget of the page checks. `value` is SMOKE_TIME_BUDGET_SECONDS (a positive integer; anything
 * else means the default). `passed()` is checked before each page and each viewport.
 */
export function makeDeadline(value, now = Date.now) {
  const parsed = /^[1-9][0-9]*$/.test(String(value ?? '').trim()) ? Number(String(value).trim()) : DEFAULT_TIME_BUDGET_SECONDS;
  const end = now() + parsed * 1000;
  return { seconds: parsed, passed: () => now() >= end };
}
