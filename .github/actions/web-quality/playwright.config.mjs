// Playwright configuration of the web-quality action. Fully driven by env (set by run.sh):
//   WQ_BASE_URL, WQ_CONFIG, WQ_SNAPSHOTS_DIR, WQ_REPORT_DIR, WQ_MAX_DIFF_PIXEL_RATIO, WQ_WORKERS
// Config keys (all optional): viewports, mask, hide, waitFor, waitForHidden, networkIdle; all but viewports also per page.
// The optional keys are validated in quality-config.mjs.
// Snapshot updates are hard-coded off: a missing or changed baseline is a failure, never an update.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import { validateOptionalKeys, validatePagePaths } from './quality-config.mjs';

function need(name) {
  const value = process.env[name];
  if (!value) throw new Error(`web-quality: env ${name} is required`);
  return value;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const reportDir = need('WQ_REPORT_DIR');
const snapshotsDir = need('WQ_SNAPSHOTS_DIR');
const baseURL = need('WQ_BASE_URL');
const ratio = Number(process.env.WQ_MAX_DIFF_PIXEL_RATIO || '0.01');
if (!(ratio >= 0 && ratio <= 1)) throw new Error('web-quality: WQ_MAX_DIFF_PIXEL_RATIO must be a number from 0 to 1');
const workers = Math.max(1, Number(process.env.WQ_WORKERS || '2') || 2);

const VIEWPORTS = {
  mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false },
};

let quality;
try {
  quality = JSON.parse(fs.readFileSync(need('WQ_CONFIG'), 'utf8'));
} catch (error) {
  throw new Error(`web-quality: cannot read the quality config: ${error.message}`);
}
if (!quality || quality.version !== 1) throw new Error('web-quality: quality config needs "version": 1');
if (!Array.isArray(quality.pages) || quality.pages.length === 0) {
  throw new Error('web-quality: quality config needs a non-empty "pages" array');
}
const ids = new Set();
for (const page of quality.pages) {
  if (!page || typeof page.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(page.id)) {
    throw new Error('web-quality: every page needs an "id" matching ^[a-z0-9][a-z0-9-]*$');
  }
  if (ids.has(page.id)) throw new Error(`web-quality: duplicate page id "${page.id}"`);
  ids.add(page.id);
}
validatePagePaths(quality, baseURL);
const viewports = quality.viewports === undefined ? ['mobile', 'desktop'] : quality.viewports;
if (!Array.isArray(viewports) || viewports.length === 0 || viewports.some((name) => !(name in VIEWPORTS))) {
  throw new Error('web-quality: "viewports" must be a non-empty list of "mobile" and/or "desktop"');
}
validateOptionalKeys(quality);

export default defineConfig({
  testDir: here,
  testMatch: 'quality.spec.mjs',
  outputDir: path.join(reportDir, 'test-results'),
  // <snapshots-dir>/<name>.png, no platform or project suffix.
  snapshotPathTemplate: `${snapshotsDir}/{arg}{ext}`,
  updateSnapshots: 'none',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  workers,
  timeout: 90_000,
  expect: { toHaveScreenshot: { maxDiffPixelRatio: ratio } },
  reporter: [
    ['list'],
    ['json', { outputFile: path.join(reportDir, 'results.json') }],
    ['html', { outputFolder: path.join(reportDir, 'html'), open: 'never' }],
  ],
  use: {
    baseURL,
    browserName: 'chromium',
    locale: 'en-US',
    timezoneId: 'UTC',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    deviceScaleFactor: 1,
  },
  projects: viewports.map((name) => ({ name, use: VIEWPORTS[name] })),
});
