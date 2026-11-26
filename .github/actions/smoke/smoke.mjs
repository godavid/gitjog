// actions/smoke runner. Reads the smoke config, checks every page over HTTP
// (no redirects followed) and in Chromium (mobile and desktop viewport) behind the
// built-in prod guard, writes <report-dir>/report.json and report.html, sets the
// `result`, `failures` and `failure-kinds` step outputs and a step summary.
// The pure parts (config parsing, failure kinds, text matching) live in checks.mjs.
//
// Environment (set by action.yml):
//   SMOKE_CONFIG       path of the smoke config, relative to GITHUB_WORKSPACE
//   SMOKE_BASE_URL     optional; replaces the config's `origin`
//   SMOKE_REPORT_NAME  report directory name (inside GITHUB_WORKSPACE) and artifact name
//   SMOKE_MARKER_DIR   optional; a tool-error also writes result.txt there (the action uploads it)
//   PROD_GUARD_TUNNEL_PATHS  optional; own-origin analytics/Sentry tunnel paths (comma list,
//                      default "/monitoring,/ingest", empty switches the rule off);
//                      `prodGuard.tunnelPaths` of the config wins over it
// Result: passed, failed or tool-error (Chromium could not launch and no check failed: not a
// verdict on the site). Exit code: 0 passed or tool-error, 1 failed (report and outputs are
// written first).

import fs from 'node:fs';
import path from 'node:path';
import { chromium, request as pwRequest } from 'playwright';
import { VIEWPORTS, classifyError, failureKinds, firstLine, makeDeadline, parseConfig, waitForText } from './checks.mjs';
import { installGuard, makeClassifier, newGuardLog } from './guard.mjs';
import { commandSafe, logSafe, mdCell, renderHtml } from './report.mjs';

const USER_AGENT_TOKEN = 'RemenySmoke/1';
const HTTP_TIMEOUT_MS = 30_000;
const NAV_TIMEOUT_MS = 30_000;
const CHECK_TIMEOUT_MS = 10_000;

const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
const configPath = path.resolve(workspace, process.env.SMOKE_CONFIG || '.monitoring/smoke.json');
const baseUrlInput = (process.env.SMOKE_BASE_URL || '').trim();
const reportName = process.env.SMOKE_REPORT_NAME || 'smoke-report';
const reportDir = path.resolve(workspace, reportName);

// ---------------------------------------------------------------- helpers

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    failureKinds: [],
    toolError: '',
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
    const { kind, message } = classifyError(lastError, pageUrl);
    record({ scope: 'http', name: 'request', ok: false, kind, message });
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
    kind: 'http',
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
      kind: 'http',
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
      kind: 'http',
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
        kind: 'http',
        message: navigated ? `${status}` : `browser got status ${status}`,
      });
    } catch (error) {
      const { kind, message } = classifyError(error, pageUrl);
      record({ scope: viewportName, name: 'navigation', ok: false, kind, message });
    }
    if (!navigated) return;

    await tab.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});

    if (page.selector) {
      try {
        await tab.locator(page.selector).first().waitFor({ state: 'visible', timeout: CHECK_TIMEOUT_MS });
        record({ scope: viewportName, name: `selector ${page.selector}`, ok: true, message: 'visible' });
      } catch (error) {
        record({ scope: viewportName, name: `selector ${page.selector}`, ok: false, kind: 'content', message: `not visible: ${firstLine(error.message)}` });
      }
    }
    if (page.text) {
      const name = `text "${page.text}"${page.textIgnoreCase ? ' (ignore case)' : ''}`;
      const found = await waitForText(tab, page.text, page.textIgnoreCase, CHECK_TIMEOUT_MS);
      record(
        found
          ? { scope: viewportName, name, ok: true, message: 'present' }
          : { scope: viewportName, name, ok: false, kind: 'content', message: `text not found within ${CHECK_TIMEOUT_MS / 1000} s` },
      );
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
      kind: 'console',
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
    report.checks.push({ name: 'config', ok: false, kind: 'config', message: `cannot read ${report.config}: ${reason}` });
    return;
  }
  let config;
  try {
    config = parseConfig(raw, { baseUrlInput });
  } catch (error) {
    report.checks.push({ name: 'config', ok: false, kind: 'config', message: `invalid ${report.config}: ${firstLine(error.message)}` });
    return;
  }
  report.origin = config.origin;
  report.viewports = config.viewports;
  report.checks.push({ name: 'config', ok: true, message: `${config.pages.length} page(s), origin ${config.origin}` });

  const classifier = makeClassifier({
    origin: config.origin,
    extraOrigins: config.extraOrigins,
    readOnlyRpc: config.readOnlyRpc,
    tunnelPaths: config.tunnelPaths,
  });
  const api = await pwRequest.newContext({ extraHTTPHeaders: { 'user-agent': `${USER_AGENT_TOKEN} (+ci-workflows smoke)` } });
  let browser;
  // A site that hangs must end as a failed smoke (kind timeout) before the job's own timeout,
  // which would leave no verdict and so no incident.
  const deadline = makeDeadline(process.env.SMOKE_TIME_BUDGET_SECONDS);
  const overBudget = (scope) => ({
    scope,
    name: 'time budget',
    ok: false,
    kind: 'timeout',
    message: `not checked: the smoke time budget of ${deadline.seconds} s was used up (a slow or hanging site)`,
  });
  try {
    for (const page of config.pages) {
      const pageUrl = new URL(page.path, config.origin).href;
      const entry = { path: page.path, url: pageUrl, checks: [], console: [] };
      report.pages.push(entry);
      const record = (c) => entry.checks.push(c);
      if (deadline.passed()) {
        record(overBudget('http'));
        continue;
      }

      const http = await httpCheck(api, page, pageUrl, record);
      const is2xx = http.ok && http.status >= 200 && http.status < 300;
      if (!is2xx) continue;

      // A browser that cannot start is the runner's problem (tool-error), not the site's: the HTTP
      // checks of the other pages still run, the browser checks are skipped.
      if (!browser && !report.toolError) {
        try {
          browser = await chromium.launch();
        } catch (error) {
          report.toolError = `chromium.launch() failed: ${firstLine(error?.message ?? error)}`;
        }
      }
      if (!browser) continue;
      for (const viewportName of config.viewports) {
        if (deadline.passed()) {
          record(overBudget(viewportName));
          continue;
        }
        try {
          await browserCheck({ browser, classifier, log: report.guard, page, pageUrl, viewportName, record, consoleLog: entry.console });
        } catch (error) {
          const { kind, message } = classifyError(error, pageUrl);
          // A non-network error inside the browser step is the runner's, not the site's.
          record({ scope: viewportName, name: 'browser', ok: false, kind: kind === 'request' ? 'internal' : kind, message });
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
    kind: 'guard',
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
  // A real failure wins over a tool-error: only a run with no failing check and a broken tool is tool-error.
  if (failed.length > 0) report.result = 'failed';
  else report.result = report.toolError ? 'tool-error' : 'passed';
  report.failureKinds = failureKinds(report);
  report.generatedAt = new Date().toISOString();
  return failed;
}

function writeOutputs(report) {
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(reportDir, 'report.html'), renderHtml(report));
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `result=${report.result}\nfailures=${report.failures}\nfailure-kinds=${report.failureKinds.join(',')}\n`,
    );
  }
  // A tool-error leaves a marker artifact (same shape as the skipped marker) for the conformance checker.
  if (report.result === 'tool-error' && process.env.SMOKE_MARKER_DIR) {
    fs.mkdirSync(process.env.SMOKE_MARKER_DIR, { recursive: true });
    fs.writeFileSync(path.join(process.env.SMOKE_MARKER_DIR, 'result.txt'), 'tool-error\n');
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
  if (report.failureKinds.length) lines.push(`Failure kinds: ${report.failureKinds.join(', ')}.`, '');
  if (report.toolError) {
    lines.push(
      report.result === 'tool-error'
        ? `The smoke tool failed, not the site: ${mdCell(report.toolError)}. No incident is opened; this is not a successful run.`
        : `Browser checks were skipped: ${mdCell(report.toolError)}.`,
      '',
    );
  }
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
    report.checks.push({ name: 'run', ok: false, kind: 'internal', message: `unexpected error: ${firstLine(error?.stack ?? error)}` });
  }
  const failed = finalize(report);
  writeOutputs(report);
  writeSummary(report, failed);

  for (const c of failed) {
    process.stdout.write(`::error title=smoke::${commandSafe(`${c.where}: ${c.name}: ${c.message}`)}\n`);
  }
  if (report.toolError) {
    process.stdout.write(`::warning title=smoke tool-error::${commandSafe(report.toolError)}\n`);
  }
  process.stdout.write(
    `smoke ${report.result}: ${report.failures} failure(s) of ${report.checkCount} check(s); ` +
      `guard aborted ${report.guard.aborted.length}, unaborted writes ${report.guard.unabortedWrites}; report ${reportDir}\n`,
  );
  process.exit(report.result === 'failed' ? 1 : 0);
}

main();
