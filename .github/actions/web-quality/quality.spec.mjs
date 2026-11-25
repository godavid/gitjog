// a11y (axe, WCAG 2.1 A/AA) and visual (toHaveScreenshot) checks, one test per page and viewport.
// The viewport is the Playwright project name (see playwright.config.mjs). Driven by env (see run.sh).
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loadBaseline, matchFindings, toFinding } from './a11y-match.mjs';

const reportDir = process.env.WQ_REPORT_DIR;
const quality = JSON.parse(fs.readFileSync(process.env.WQ_CONFIG, 'utf8'));
const RUN_A11Y = process.env.WQ_RUN_A11Y === 'true';
const RUN_VISUAL = process.env.WQ_RUN_VISUAL === 'true';
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// Global lists plus the page's own list (config keys mask, hide, waitFor; validated in playwright.config.mjs).
const selectors = (entry, key) => [...(quality[key] || []), ...(entry[key] || [])];

// One finding per axe node (no de-duplication: the baseline counts with multiplicity, see a11y-match.mjs).
function toFindings(violations, pagePath, viewport) {
  return violations.flatMap((violation) => violation.nodes.map((node) => toFinding(violation, node, pagePath, viewport)));
}

async function open(page, pagePath) {
  const response = await page.goto(pagePath, { waitUntil: 'load' });
  const status = response ? response.status() : 0;
  if (status === 0 || status >= 400) throw new Error(`HTTP ${status} for ${pagePath}`);
  return status;
}

// Elements that must be visible before a11y and visual run (late content, hydration).
async function waitForElements(page, entry) {
  for (const selector of selectors(entry, 'waitFor')) {
    try {
      await page.locator(selector).first().waitFor({ state: 'visible', timeout: 30_000 });
    } catch (error) {
      throw new Error(`waitFor "${selector}" on ${entry.path} did not become visible within 30 s: ${String(error.message).split('\n')[0]}`);
    }
  }
}

// Style sheet that keeps the layout and hides the volatile elements during the screenshot only.
function hideCss(entry) {
  return selectors(entry, 'hide').map((selector) => `${selector} { visibility: hidden !important; }`).join('\n');
}

for (const entry of quality.pages) {
  if (RUN_A11Y) {
    test(`a11y: ${entry.id}`, async ({ page }, testInfo) => {
      const viewport = testInfo.project.name;
      const baseline = loadBaseline(process.env.WQ_A11Y_BASELINE);
      const status = await open(page, entry.path);
      await waitForElements(page, entry);
      const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      const findings = toFindings(results.violations, entry.path, viewport);
      const { fresh } = matchFindings(baseline, findings);
      const dir = path.join(reportDir, 'a11y');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, `${entry.id}-${viewport}.json`),
        JSON.stringify({ id: entry.id, viewport, status, findings, new: fresh }, null, 2),
      );
      expect(fresh, `new a11y findings on ${entry.path} (${viewport})`).toEqual([]);
    });
  }
  if (RUN_VISUAL) {
    test(`visual: ${entry.id}`, async ({ page }, testInfo) => {
      const viewport = testInfo.project.name;
      const name = `${entry.id}-${viewport}`;
      await open(page, entry.path);
      await waitForElements(page, entry);
      const css = hideCss(entry);
      const stylePath = testInfo.outputPath(`${name}-hide.css`);
      if (css) fs.writeFileSync(stylePath, `${css}\n`);
      const shot = {
        fullPage: true,
        animations: 'disabled',
        caret: 'hide',
        mask: selectors(entry, 'mask').filter((selector) => selector.trim() !== '').map((selector) => page.locator(selector)),
      };
      const expectedPath = testInfo.snapshotPath(`${name}.png`);
      if (!fs.existsSync(expectedPath)) {
        // With updateSnapshots 'none' Playwright 1.65 fails a missing baseline without writing the image.
        // Write the actual image ourselves (to the test output dir, never to the snapshots dir) so that
        // the owner can review it and promote it with templates/scripts/promote-actuals.
        let actual = await page.screenshot({ ...shot, ...(css ? { style: css } : {}) });
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const again = await page.screenshot({ ...shot, ...(css ? { style: css } : {}) });
          const stable = again.equals(actual);
          actual = again;
          if (stable) break;
        }
        const actualPath = testInfo.outputPath(`${name}-actual.png`);
        fs.writeFileSync(actualPath, actual);
        await testInfo.attach(`${name}-actual`, { path: actualPath, contentType: 'image/png' });
        throw new Error(`A snapshot doesn't exist at ${expectedPath}.`);
      }
      await expect(page).toHaveScreenshot(`${name}.png`, {
        ...shot,
        ...(css ? { stylePath } : {}),
        maxDiffPixelRatio: Number(process.env.WQ_MAX_DIFF_PIXEL_RATIO || '0.01'),
      });
    });
  }
}
