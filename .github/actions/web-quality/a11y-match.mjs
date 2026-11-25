// a11y baseline matching of the web-quality action. One module, used by quality.spec.mjs (per page and
// viewport) and by the evaluator in run.sh (stale entries, a11y-current.json).
//
// A finding is a node of an axe violation:
//   { rule, target, path, viewport, impact, help, html }
// The identity is: rule id + page path + viewport + a normalized excerpt of the node. A current finding is
// known when an unused baseline entry of the same rule, path and viewport has the same normalized html OR
// the same normalized target. Equal entries count with multiplicity: a baseline with 3 equal entries and a
// current run with 4 leaves 1 new finding.
import fs from 'node:fs';

// Positional parts of a selector. axe builds them from the position of the node, so one inserted element
// changes them. They are removed from the target before it is compared.
const POSITIONAL_FUNCTIONS = /:(?:nth-child|nth-of-type|nth-last-child|nth-last-of-type)\([^()]*\)/g;
const POSITIONAL_KEYWORDS = /:(?:first-child|last-child|first-of-type|last-of-type|only-child|only-of-type)(?![\w-])/g;

// Attribute values that name another element: a generated value there is as volatile as an id.
const ID_ATTRIBUTES = ['id', 'for', 'aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns', 'aria-activedescendant'];

// An identifier produced by a framework or a build at run time: React useId (":r1:", "«r1»"), library
// prefixes with a counter ("radix-:r2:", "headlessui-menu-button-12", "ember123"), UUIDs and any run of four
// or more digits (timestamps, database ids, hashes of numbers).
const GENERATED_ID = [
  /(?:^|[-_])[:«]r[0-9a-z]+[:»]/i,
  /^(?:radix|headlessui|react-aria|mui|ember|ui|rc|downshift|reach|mantine|chakra|react-select|react-day-picker)[-_:]?[\w:«»-]*\d/i,
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  /\d{4,}/,
];

export const isGeneratedId = (value) => String(value).split(/\s+/).filter(Boolean).some((token) => GENERATED_ID.some((re) => re.test(token)));

const collapse = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

const unescapeCss = (s) => s.replace(/\\([0-9a-f]{1,6})\s?/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16))).replace(/\\(.)/g, '$1');

// The axe target of a node: nested (iframe, shadow DOM) targets are joined with a space by the caller.
// Positional parts are dropped, generated ids become "#*", whitespace is collapsed.
export function normalizeTarget(target) {
  const joined = Array.isArray(target) ? target.flat(Infinity).join(' ') : String(target ?? '');
  return collapse(
    joined
      .replace(POSITIONAL_FUNCTIONS, '')
      .replace(POSITIONAL_KEYWORDS, '')
      .replace(/#((?:\\.|[^\s>+~.,[\]:()#\\])+)/g, (whole, id) => (isGeneratedId(unescapeCss(id)) ? '#*' : whole)),
  )
    // "ul > > li" is what is left of "ul > :nth-child(2) > li" after the removal.
    .replace(/([>+~])(?:\s*[>+~])+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

// The html excerpt of a node: whitespace collapsed; style and nonce attributes dropped (inline styles change
// with state and animations, a nonce changes with every response); generated ids replaced by "#".
export function normalizeHtml(html) {
  let out = collapse(html).replace(/\s(?:style|nonce)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  for (const name of ID_ATTRIBUTES) {
    out = out.replace(new RegExp(`(\\s${name}\\s*=\\s*)(?:"([^"]*)"|'([^']*)')`, 'gi'), (whole, head, dq, sq) => {
      const value = dq ?? sq;
      return isGeneratedId(value) ? `${head}"#"` : whole;
    });
  }
  return out;
}

const groupKey = (f) => JSON.stringify([f.rule, f.path, f.viewport]);

// Normalized identity of an entry. A version 1 baseline entry has no html: only the target can match.
function identity(f) {
  const html = f.html === undefined || f.html === null || f.html === '' ? null : normalizeHtml(f.html);
  const target = f.target === undefined || f.target === null ? null : normalizeTarget(f.target);
  return { html, target };
}

// Split `current` into known and new findings, and `baseline` into used and stale entries (same matching on
// both sides, with multiplicity). Both lists hold findings in the shape above (baseline entries of version 1
// have no html).
export function matchFindings(baseline, current) {
  const groups = new Map();
  baseline.forEach((entry, index) => {
    const key = groupKey(entry);
    if (!groups.has(key)) groups.set(key, { base: [], cur: [] });
    groups.get(key).base.push({ entry, index, ...identity(entry), used: false });
  });
  current.forEach((finding, index) => {
    const key = groupKey(finding);
    if (!groups.has(key)) groups.set(key, { base: [], cur: [] });
    groups.get(key).cur.push({ finding, index, ...identity(finding), matched: false });
  });
  for (const { base, cur } of groups.values()) {
    // Maximum matching (augmenting paths): a current finding pairs with a baseline entry of the same html
    // or the same target. A greedy pass could let one finding take the only entry another finding can use
    // (two equal html snippets, one of them changed), and report an accepted finding as new. Html edges
    // are tried first, so with a choice the pairing follows the html.
    const edges = cur.map((c) => {
      const byHtml = [];
      const byTarget = [];
      base.forEach((b, j) => {
        if (c.html !== null && b.html !== null && b.html === c.html) byHtml.push(j);
        else if (c.target !== null && b.target !== null && b.target === c.target) byTarget.push(j);
      });
      return [...byHtml, ...byTarget];
    });
    const owner = new Array(base.length).fill(-1);
    const augment = (i, seen) => {
      for (const j of edges[i]) {
        if (seen[j]) continue;
        seen[j] = true;
        if (owner[j] === -1 || augment(owner[j], seen)) {
          owner[j] = i;
          return true;
        }
      }
      return false;
    };
    cur.forEach((_, i) => augment(i, new Array(base.length).fill(false)));
    owner.forEach((i, j) => {
      if (i === -1) return;
      base[j].used = true;
      cur[i].matched = true;
    });
  }
  const all = [...groups.values()];
  return {
    known: all.flatMap((g) => g.cur.filter((c) => c.matched)).sort((a, b) => a.index - b.index).map((c) => c.finding),
    fresh: all.flatMap((g) => g.cur.filter((c) => !c.matched)).sort((a, b) => a.index - b.index).map((c) => c.finding),
    stale: all.flatMap((g) => g.base.filter((b) => !b.used)).sort((a, b) => a.index - b.index).map((b) => b.entry),
  };
}

// Build a finding from an axe node. `html` is stored normalized; `target` stays as axe reported it.
export function toFinding(violation, node, pagePath, viewport) {
  return {
    rule: violation.id,
    target: [node.target].flat(Infinity).join(' '),
    path: pagePath,
    viewport,
    impact: node.impact || violation.impact || null,
    help: violation.help,
    html: normalizeHtml(node.html),
  };
}

export const findingSort = (a, b) => {
  const k = (f) => JSON.stringify([f.rule, f.path, f.viewport, normalizeTarget(f.target), f.html ?? '']);
  const x = k(a);
  const y = k(b);
  return x < y ? -1 : x > y ? 1 : 0;
};

// Validate a baseline file body. Versions 1 and 2 are accepted; returns the entries.
export function parseBaseline(data, label = 'a11y baseline') {
  if (!data || typeof data !== 'object' || ![1, 2].includes(data.version) || !Array.isArray(data.findings)) {
    throw new Error(`${label} must be {"version":1|2,"findings":[...]}`);
  }
  data.findings.forEach((f, i) => {
    const bad = (why) => new Error(`${label}: findings[${i}] ${why}`);
    if (!f || typeof f !== 'object') throw bad('must be an object');
    for (const k of ['rule', 'path', 'viewport']) if (typeof f[k] !== 'string' || f[k] === '') throw bad(`needs a string "${k}"`);
    const hasTarget = typeof f.target === 'string' && f.target !== '';
    const hasHtml = typeof f.html === 'string' && f.html !== '';
    if (!hasTarget && !hasHtml) throw bad('needs a "target" (version 1) or an "html" excerpt (version 2)');
    if (f.target !== undefined && typeof f.target !== 'string') throw bad('"target" must be a string');
    if (f.html !== undefined && typeof f.html !== 'string') throw bad('"html" must be a string');
  });
  return data.findings;
}

// A missing file is an empty baseline.
export function loadBaseline(file) {
  if (!file || !fs.existsSync(file)) return [];
  return parseBaseline(JSON.parse(fs.readFileSync(file, 'utf8')), `a11y baseline ${file}`);
}

export const currentDocument = (findings) => ({
  version: 2,
  findings: [...findings].sort(findingSort).map((f) => ({ rule: f.rule, target: f.target, path: f.path, viewport: f.viewport, impact: f.impact, help: f.help, html: f.html })),
});
