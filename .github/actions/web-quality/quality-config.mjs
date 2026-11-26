// Validation and "loaded state" waiting of the optional quality.json keys. Pure (no Playwright import), so
// node --test covers it (quality-config.test.mjs). Used by playwright.config.mjs and quality.spec.mjs.
//
// Optional selector lists, global and per page: mask, hide, waitFor, waitForHidden.
// Optional boolean, global and per page (the page value wins): networkIdle.

export const SELECTOR_KEYS = ['mask', 'hide', 'waitFor', 'waitForHidden'];
export const WAIT_TIMEOUT_MS = 30_000;

function selectorList(value, where, key) {
  if (value === undefined) return;
  // mask is a v1.0.0 key: v1.0.0 accepted any string, so an empty mask selector stays valid (it is skipped).
  const allowEmpty = key === 'mask';
  if (!Array.isArray(value) || value.some((s) => typeof s !== 'string' || (!allowEmpty && s.trim() === ''))) {
    throw new Error(`web-quality: ${where} "${key}" must be a list of ${allowEmpty ? '' : 'non-empty '}CSS selectors`);
  }
  // "hide" selectors end up in a generated style sheet: no braces, no ";" so a selector cannot add rules.
  if (key === 'hide' && value.some((s) => /[{};]/.test(s))) {
    throw new Error(`web-quality: ${where} "hide" selectors must not contain "{", "}" or ";"`);
  }
}

function booleanKey(value, where, key) {
  if (value === undefined) return;
  if (typeof value !== 'boolean') throw new Error(`web-quality: ${where} "${key}" must be true or false`);
}

// Throws on the first invalid optional key (config level, then every page).
export function validateOptionalKeys(quality) {
  for (const key of SELECTOR_KEYS) {
    selectorList(quality[key], 'the config', key);
    for (const page of quality.pages) selectorList(page[key], `page "${page.id}"`, key);
  }
  booleanKey(quality.networkIdle, 'the config', 'networkIdle');
  for (const page of quality.pages) booleanKey(page.networkIdle, `page "${page.id}"`, 'networkIdle');
}

// Every page path must be a path on the base URL's origin. "//host/" and "/\\host/" are valid URL references
// to another origin: new URL(path, base) would send the a11y and visual checks to a foreign site. Control
// characters are rejected too (the URL parser drops tabs and newlines, so "/<TAB>/host" would become "//host").
export function validatePagePaths(quality, baseURL) {
  const origin = new URL(baseURL).origin;
  for (const page of quality.pages) {
    const where = `page "${page.id}"`;
    if (typeof page.path !== 'string' || !page.path.startsWith('/')) {
      throw new Error(`web-quality: ${where} needs a "path" starting with "/"`);
    }
    if (page.path.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(page.path)) {
      throw new Error(`web-quality: ${where} "path" must be a path on the base URL: one leading "/", no backslash or control character (got ${JSON.stringify(page.path)})`);
    }
    let resolved;
    try {
      resolved = new URL(page.path, baseURL);
    } catch (error) {
      throw new Error(`web-quality: ${where} "path" is not a valid URL path (${JSON.stringify(page.path)}): ${firstLine(error)}`);
    }
    if (resolved.origin !== origin) {
      throw new Error(`web-quality: ${where} "path" leaves the base URL origin ${origin} (resolves to ${resolved.origin}): ${JSON.stringify(page.path)}`);
    }
  }
}

// Global list plus the page's own list.
export const selectorsFor = (quality, entry, key) => [...(quality[key] || []), ...(entry[key] || [])];

// The page's networkIdle wins over the global one; default false.
export const networkIdleFor = (quality, entry) => (entry.networkIdle !== undefined ? entry.networkIdle : quality.networkIdle === true);

const firstLine = (error) => String((error && error.message) || error).split('\n')[0];

// Everything that must hold before a11y and the screenshot run, in this order:
//   1. waitFor: every selector matches a visible element
//   2. waitForHidden: no element of the selector is visible any more (skeletons, spinners)
//   3. networkIdle: no network connection for 500 ms (fallback for apps without a ready marker)
export async function waitForLoaded(page, quality, entry, timeout = WAIT_TIMEOUT_MS) {
  const seconds = Math.round(timeout / 1000);
  for (const selector of selectorsFor(quality, entry, 'waitFor')) {
    try {
      await page.locator(selector).first().waitFor({ state: 'visible', timeout });
    } catch (error) {
      throw new Error(`waitFor "${selector}" on ${entry.path} did not become visible within ${seconds} s: ${firstLine(error)}`);
    }
  }
  for (const selector of selectorsFor(quality, entry, 'waitForHidden')) {
    try {
      // No visible match is left: hidden, display:none and removed elements all count (all matches, not only the first).
      await page.locator(selector).filter({ visible: true }).first().waitFor({ state: 'detached', timeout });
    } catch (error) {
      throw new Error(`waitForHidden "${selector}" on ${entry.path} was still visible after ${seconds} s: ${firstLine(error)}`);
    }
  }
  if (networkIdleFor(quality, entry)) {
    try {
      await page.waitForLoadState('networkidle', { timeout });
    } catch (error) {
      throw new Error(`networkIdle on ${entry.path}: the network was not idle within ${seconds} s (a poll, websocket or long request keeps it busy; use waitFor or waitForHidden with a ready marker instead): ${firstLine(error)}`);
    }
  }
}
