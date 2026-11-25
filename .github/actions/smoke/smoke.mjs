// actions/smoke runner. Reads the smoke config, checks every page over HTTP
// (no redirects followed) and in Chromium (mobile and desktop viewport) behind the
// built-in prod guard, writes <report-dir>/report.json and report.html, sets the
// `result` and `failures` step outputs and a step summary.
//
// Environment (set by action.yml):
//   SMOKE_CONFIG       path of the smoke config, relative to GITHUB_WORKSPACE
//   SMOKE_BASE_URL     optional; replaces the config's `origin`
//   SMOKE_REPORT_NAME  report directory name (inside GITHUB_WORKSPACE) and artifact name
// Exit code: 0 passed, 1 failed (report and outputs are written first).

import fs from 'node:fs';
import path from 'node:path';
import { chromium, request as pwRequest } from 'playwright';
import { installGuard, makeClassifier, newGuardLog, normalizeOrigin } from './guard.mjs';
import { commandSafe, logSafe, mdCell, renderHtml } from './report.mjs';

const VIEWPORTS = {
  mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false },
};
const USER_AGENT_TOKEN = 'RemenySmoke/1';
const HTTP_TIMEOUT_MS = 30_000;
const NAV_TIMEOUT_MS = 30_000;
const CHECK_TIMEOUT_MS = 10_000;

const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
const configPath = path.resolve(workspace, process.env.SMOKE_CONFIG || '.monitoring/smoke.json');
const baseUrlInput = (process.env.SMOKE_BASE_URL || '').trim();
const reportName = process.env.SMOKE_REPORT_NAME || 'smoke-report';
const reportDir = path.resolve(workspace, reportName);

// ---------------------------------------------------------------- config

function fail(message) {
  throw new Error(message);
}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function parseConfig(raw) {
  if (!isObject(raw)) fail('config must be a JSON object');
  if (raw.version !== 1) fail(`config.version must be 1 (got ${JSON.stringify(raw.version)})`);

  let origin;
  if (baseUrlInput) {
    const u = new URL(normalizeOrigin(baseUrlInput, 'base-url'));
    const full = new URL(baseUrlInput);
    if ((full.pathname !== '/' && full.pathname !== '') || full.search || full.hash) {
      fail(`base-url must be an origin without path, query or fragment: ${JSON.stringify(baseUrlInput)}`);
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

  return { origin, viewports, pages, extraOrigins, readOnlyRpc };
}

// ---------------------------------------------------------------- helpers

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const firstLine = (s) => String(s).split('\n')[0];

function describeError(error, url) {
  const message = firstLine(error?.message ?? error);
  const host = new URL(url).hostname;
  if (/ENOTFOUND|EAI_AGAIN|ERR_NAME_NOT_RESOLVED|getaddrinfo/i.test(message)) {
    return `DNS resolution failed for host "${host}": ${message}`;
  }
  if (/ECONNREFUSED|ERR_CONNECTION_REFUSED/i.test(message)) return `connection refused by "${host}": ${message}`;
  if (/ETIMEDOUT|ERR_CONNECTION_TIMED_OUT|Timeout/i.test(message)) return `timeout talking to "${host}": ${message}`;
  return `request to "${host}" failed: ${message}`;
}

function sameLocation(expected, actual, pageUrl) {
  if (expected === actual) return true;
  try {
    return new URL(expected, pageUrl).href === new URL(actual, pageUrl).href;
  } catch {
    return false;
  }
}

function emptyReport() {
  return {
    version: 1,
    tool: 'ci-workflows/actions/smoke',
    result: 'failed',
    failures: 0,
    checkCount: 0,
    origin: '',
    baseUrlOverride: Boolean(baseUrlInput),
    viewports: [],
    config: path.relative(workspace, configPath),
    generatedAt: new Date().toISOString(),
    checks: [],
    pages: [],
    guard: newGuardLog(),
  };
}

// ---------------------------------------------------------------- checks

async function httpCheck(api, page, pageUrl, record) {
  let response;
  let lastError;
  for (let attempt = 1; attempt <= 2 && !response; attempt += 1) {
    try {
      response = await api.get(pageUrl, { maxRedirects: 0, failOnStatusCode: false, timeout: HTTP_TIMEOUT_MS });
    } catch (error) {
      lastError = error;
      if (attempt === 1) await sleep(1000);
    }
  }
  if (!response) {
    const message = describeError(lastError, pageUrl);
    record({ scope: 'http', name: 'request', ok: false, message });
    return { ok: false };
  }

  const status = response.status();
  const headers = response.headers();
  const location = headers.location;
  const statusOk = page.status.includes(status);
  record({
    scope: 'http',
    name: 'status',
    ok: statusOk,
    message: statusOk
      ? `${status}`
      : `expected ${page.status.join(' or ')}, got ${status}${location ? ` (Location: ${location})` : ''}`,
  });

  if (page.location !== undefined) {
    const ok = location !== undefined && sameLocation(page.location, location, pageUrl);
    record({
      scope: 'http',
      name: 'location',
      ok,
      message: ok ? location : `expected Location ${page.location}, got ${location === undefined ? 'no Location header' : location}`,
    });
  }

  for (const [name, expected] of Object.entries(page.headers)) {
    const actual = headers[name.toLowerCase()];
    const ok = actual !== undefined && actual.toLowerCase().includes(expected.toLowerCase());
    record({
      scope: 'http',
      name: `header ${name.toLowerCase()}`,
      ok,
      message: ok ? actual : `expected to contain "${expected}", got ${actual === undefined ? 'no such header' : `"${actual}"`}`,
    });
  }
  return { ok: statusOk, status };
}

async function browserCheck({ browser, classifier, log, page, pageUrl, viewportName, record, consoleLog }) {
  const spec = VIEWPORTS[viewportName];
  const context = await browser.newContext({
    ...spec,
    serviceWorkers: 'block',
    userAgent: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/${browser.version()} Safari/537.36 ${USER_AGENT_TOKEN}`,
  });
  const guard = await installGuard(context, classifier, log, { page: page.path, viewport: viewportName });
  const tab = await context.newPage();
  const errors = [];
  tab.on('console', (message) => {
    if (message.type() === 'error') errors.push({ kind: 'console', text: message.text(), url: message.location().url });
  });
  tab.on('pageerror', (error) => errors.push({ kind: 'pageerror', text: firstLine(error.message ?? error), url: '' }));

  try {
    let navigated = false;
    try {
      const response = await tab.goto(pageUrl, { waitUntil: 'load', timeout: NAV_TIMEOUT_MS });
      const status = response ? response.status() : 0;
      navigated = response !== null && status >= 200 && status < 300;
      record({
        scope: viewportName,
        name: 'navigation',
        ok: navigated,
        message: navigated ? `${status}` : `browser got status ${status}`,
      });
    } catch (error) {
      record({ scope: viewportName, name: 'navigation', ok: false, message: describeError(error, pageUrl) });
    }
    if (!navigated) return;

    await tab.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});

    if (page.selector) {
      try {
        await tab.locator(page.selector).first().waitFor({ state: 'visible', timeout: CHECK_TIMEOUT_MS });
        record({ scope: viewportName, name: `selector ${page.selector}`, ok: true, message: 'visible' });
      } catch (error) {
        record({ scope: viewportName, name: `selector ${page.selector}`, ok: false, message: `not visible: ${firstLine(error.message)}` });
      }
    }
    if (page.text) {
      try {
        await tab.waitForFunction((t) => Boolean(document.body) && document.body.innerText.includes(t), page.text, {
          timeout: CHECK_TIMEOUT_MS,
        });
        record({ scope: viewportName, name: `text "${page.text}"`, ok: true, message: 'present' });
      } catch (error) {
        record({ scope: viewportName, name: `text "${page.text}"`, ok: false, message: `text not found: ${firstLine(error.message)}` });
      }
    }

    // Resource errors that the guard itself caused (an aborted request) are not page errors.
    const counted = errors.filter((e) => {
      const guardCaused = e.kind === 'console' && /^Failed to load resource/.test(e.text) && guard.abortedUrls.has(e.url);
      if (guardCaused) log.ignoredConsoleErrors += 1;
      return !guardCaused;
    });
    for (const e of counted) consoleLog.push({ viewport: viewportName, kind: e.kind, text: logSafe(e.text, 1000) });
    const budget = page.consoleErrorBudget;
    record({
      scope: viewportName,
      name: 'console errors',
      ok: counted.length <= budget,
      message: `${counted.length} error(s), budget ${budget}${counted.length ? `: ${logSafe(counted[0].text, 200)}` : ''}`,
    });
  } finally {
    guard.finish();
    await context.close().catch(() => {});
  }
}

// ---------------------------------------------------------------- run

async function run(report) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    const reason = error.code === 'ENOENT' ? 'file not found' : firstLine(error.message);
    report.checks.push({ name: 'config', ok: false, message: `cannot read ${report.config}: ${reason}` });
    return;
  }
  let config;
  try {
    config = parseConfig(raw);
  } catch (error) {
    report.checks.push({ name: 'config', ok: false, message: `invalid ${report.config}: ${firstLine(error.message)}` });
    return;
  }
  report.origin = config.origin;
  report.viewports = config.viewports;
  report.checks.push({ name: 'config', ok: true, message: `${config.pages.length} page(s), origin ${config.origin}` });

  const classifier = makeClassifier({
    origin: config.origin,
    extraOrigins: config.extraOrigins,
    readOnlyRpc: config.readOnlyRpc,
  });
  const api = await pwRequest.newContext({ extraHTTPHeaders: { 'user-agent': `${USER_AGENT_TOKEN} (+ci-workflows smoke)` } });
  let browser;
  try {
    for (const page of config.pages) {
      const pageUrl = new URL(page.path, config.origin).href;
      const entry = { path: page.path, url: pageUrl, checks: [], console: [] };
      report.pages.push(entry);
      const record = (c) => entry.checks.push(c);

      const http = await httpCheck(api, page, pageUrl, record);
      const is2xx = http.ok && http.status >= 200 && http.status < 300;
      if (!is2xx) continue;

      browser ??= await chromium.launch();
      for (const viewportName of config.viewports) {
        try {
          await browserCheck({ browser, classifier, log: report.guard, page, pageUrl, viewportName, record, consoleLog: entry.console });
        } catch (error) {
          record({ scope: viewportName, name: 'browser', ok: false, message: describeError(error, pageUrl) });
        }
      }
    }
  } finally {
    await api.dispose().catch(() => {});
    await browser?.close().catch(() => {});
  }

  const writes = report.guard.unabortedWrites;
  report.checks.push({
    name: 'prod-guard: unaborted writes',
    ok: writes === 0,
    message: `${writes} unaborted write(s), ${report.guard.aborted.length} request(s) aborted`,
  });
}

// ---------------------------------------------------------------- output

function failedChecks(report) {
  const list = report.checks.filter((c) => !c.ok).map((c) => ({ where: 'general', ...c }));
  for (const p of report.pages) {
    for (const c of p.checks) if (!c.ok) list.push({ where: p.path, ...c });
  }
  return list;
}

function finalize(report) {
  const failed = failedChecks(report);
  report.failures = failed.length;
  report.checkCount = report.checks.length + report.pages.reduce((n, p) => n + p.checks.length, 0);
  report.result = failed.length === 0 ? 'passed' : 'failed';
  report.generatedAt = new Date().toISOString();
  return failed;
}

function writeOutputs(report) {
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(reportDir, 'report.html'), renderHtml(report));
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `result=${report.result}\nfailures=${report.failures}\n`);
  }
}

function writeSummary(report, failed) {
  const lines = [
    `### Smoke: ${report.result}`,
    '',
    `Origin \`${mdCell(report.origin || 'n/a')}\`${report.baseUrlOverride ? ' (base-url override)' : ''}, ` +
      `${report.checkCount} check(s), ${report.failures} failure(s), ` +
      `prod guard: ${report.guard.aborted.length} aborted, ${report.guard.unabortedWrites} unaborted writes.`,
    '',
  ];
  if (failed.length) {
    lines.push('| Where | Check | Detail |', '|---|---|---|');
    for (const c of failed) lines.push(`| ${mdCell(c.where)}${c.scope ? ` (${mdCell(c.scope)})` : ''} | ${mdCell(c.name)} | ${mdCell(c.message)} |`);
    lines.push('');
  }
  lines.push(`Full report: artifact \`${mdCell(reportName)}\` (report.html, report.json).`, '');
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
}

async function main() {
  const report = emptyReport();
  try {
    await run(report);
  } catch (error) {
    report.checks.push({ name: 'run', ok: false, message: `unexpected error: ${firstLine(error?.stack ?? error)}` });
  }
  const failed = finalize(report);
  writeOutputs(report);
  writeSummary(report, failed);

  for (const c of failed) {
    process.stdout.write(`::error title=smoke::${commandSafe(`${c.where}: ${c.name}: ${c.message}`)}\n`);
  }
  process.stdout.write(
    `smoke ${report.result}: ${report.failures} failure(s) of ${report.checkCount} check(s); ` +
      `guard aborted ${report.guard.aborted.length}, unaborted writes ${report.guard.unabortedWrites}; report ${reportDir}\n`,
  );
  process.exit(report.result === 'passed' ? 0 : 1);
}

main();
