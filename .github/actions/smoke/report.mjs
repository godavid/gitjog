// Report helpers of actions/smoke: HTML rendering and output sanitising.
// The HTML report is self-contained (inline CSS, no script, no external request).

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Makes text from a page or a server safe to print to a workflow log (no workflow commands). */
export function logSafe(value, max = 500) {
  let s = String(value).replace(/[\r\n]+/g, ' ').replace(/::/g, ':​:');
  if (s.length > max) s = `${s.slice(0, max)}...`;
  return s;
}

/** Escapes text for a GitHub workflow command message. */
export function commandSafe(value) {
  return logSafe(value, 1000).replace(/%/g, '%25');
}

/** Escapes text for a Markdown table cell. */
export function mdCell(value, max = 300) {
  let s = logSafe(value, max);
  s = s.replace(/[|`<>\\]/g, (c) => `\\${c}`);
  return s;
}

const CSS = `
body{font:14px/1.45 system-ui,sans-serif;margin:2rem auto;max-width:72rem;padding:0 1rem;color:#1a1a1a}
h1{font-size:1.4rem}h2{font-size:1.1rem;margin-top:2rem}
.pass{color:#0a6b2d}.fail{color:#b00020;font-weight:600}.skip{color:#666}
table{border-collapse:collapse;width:100%;margin:.5rem 0}
th,td{border:1px solid #d0d0d0;padding:.3rem .5rem;text-align:left;vertical-align:top}
th{background:#f3f3f3}code{font:12px ui-monospace,monospace;word-break:break-all}
.badge{display:inline-block;padding:.1rem .6rem;border-radius:1rem;color:#fff}
.badge.passed{background:#0a6b2d}.badge.failed{background:#b00020}.badge.skipped{background:#666}
`;

function cls(ok) {
  return ok ? 'pass' : 'fail';
}

export function renderHtml(report) {
  const e = escapeHtml;
  const rows = [];
  for (const page of report.pages) {
    for (const c of page.checks) {
      rows.push(
        `<tr><td><code>${e(page.path)}</code></td><td>${e(c.scope)}</td><td>${e(c.name)}</td>` +
          `<td class="${cls(c.ok)}">${c.ok ? 'pass' : 'FAIL'}</td><td>${e(c.message || '')}</td></tr>`,
      );
    }
  }
  const generalRows = report.checks.map(
    (c) =>
      `<tr><td>${e(c.name)}</td><td class="${cls(c.ok)}">${c.ok ? 'pass' : 'FAIL'}</td><td>${e(c.message || '')}</td></tr>`,
  );
  const aborted = report.guard.aborted.map(
    (a) =>
      `<tr><td>${e(a.method)}</td><td><code>${e(a.url)}</code></td><td>${e(a.reason)}</td>` +
      `<td><code>${e(a.page)}</code> ${e(a.viewport)}</td></tr>`,
  );
  const consoleRows = report.pages.flatMap((p) =>
    (p.console || []).map(
      (c) =>
        `<tr><td><code>${e(p.path)}</code></td><td>${e(c.viewport)}</td><td>${e(c.kind)}</td><td>${e(c.text)}</td></tr>`,
    ),
  );
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Smoke report: ${e(report.result)}</title>
<style>${CSS}</style></head><body>
<h1>Smoke report <span class="badge ${e(report.result)}">${e(report.result)}</span></h1>
<p>Origin: <code>${e(report.origin)}</code>${report.baseUrlOverride ? ' (base-url override)' : ''}<br>
Viewports: ${e(report.viewports.join(', '))}<br>
Failures: <strong>${e(report.failures)}</strong> of ${e(report.checkCount)} checks<br>
Prod guard: ${e(report.guard.aborted.length)} aborted request(s), unaborted writes
<strong class="${cls(report.guard.unabortedWrites === 0)}">${e(report.guard.unabortedWrites)}</strong><br>
Generated: ${e(report.generatedAt)}</p>
${generalRows.length ? `<h2>General checks</h2><table><tr><th>Check</th><th>Result</th><th>Detail</th></tr>${generalRows.join('')}</table>` : ''}
<h2>Page checks</h2>
<table><tr><th>Path</th><th>Scope</th><th>Check</th><th>Result</th><th>Detail</th></tr>${rows.join('') || '<tr><td colspan="5">none</td></tr>'}</table>
<h2>Console errors</h2>
<table><tr><th>Path</th><th>Viewport</th><th>Kind</th><th>Text</th></tr>${consoleRows.join('') || '<tr><td colspan="4">none</td></tr>'}</table>
<h2>Prod guard: aborted requests</h2>
<table><tr><th>Method</th><th>URL</th><th>Reason</th><th>Page</th></tr>${aborted.join('') || '<tr><td colspan="4">none</td></tr>'}</table>
</body></html>
`;
}
